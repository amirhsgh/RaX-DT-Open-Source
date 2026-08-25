import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Eye,
  FlaskConical,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import Plot from 'react-plotly.js';
import apiService from '../services/apiService';
import NGLMoleculeViewer from '../components/MoleculeViewer/NGLMoleculeViewer';

// shadcn/ui imports
import { Button } from '../components/UI/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/UI/Card';
import { Badge } from '../components/UI/Badge';
import { Alert, AlertDescription } from '../components/UI/Alert';
import { Loading } from '../components/UI/Loading';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/UI/tabs';
import { Input } from '../components/UI/Input';
import { TooltipContent, TooltipProvider, TooltipTrigger } from '../components/UI/tooltip';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/UI/table';

const Results = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [results, setResults] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    minAffinity: '',
    maxAffinity: '',
    limit: 100
  });
  const [selectedLigandId, setSelectedLigandId] = useState(null);
  const [activeTab, setActiveTab] = useState('results');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    fetchResultsData();
  }, [jobId]);

  const fetchResultsData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Only pass affinity filters if they have values
      const minAffinity = filters.minAffinity ? parseFloat(filters.minAffinity) : undefined;
      const maxAffinity = filters.maxAffinity ? parseFloat(filters.maxAffinity) : undefined;

      const [jobData, resultsData, topResultsData, statsData] = await Promise.allSettled([
        apiService.getJob(jobId),
        apiService.getJobResults(jobId, 0, filters.limit, minAffinity, maxAffinity),
        apiService.getTopResults(jobId, 50),
        apiService.getJobStatistics(jobId)
      ]);

      if (jobData.status === 'fulfilled') {
        setJob(jobData.value);
      } else {
        console.error('Failed to fetch job:', jobData.reason);
      }

      if (resultsData.status === 'fulfilled') {
        setResults(resultsData.value);
      } else {
        console.error('Failed to fetch results:', resultsData.reason);
        setResults([]);
      }

      if (topResultsData.status === 'fulfilled') {
        console.log('Top results loaded:', topResultsData.value);
      } else {
        console.error('Failed to fetch top results:', topResultsData.reason);
      }

      if (statsData.status === 'fulfilled') {
        setStatistics(statsData.value);
      } else {
        console.error('Failed to fetch statistics:', statsData.reason);
      }

    } catch (error) {
      console.error('Failed to fetch results data:', error);
      setError('Failed to load results data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await apiService.exportResultsCSV(jobId, false);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `docking_results_${jobId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Results exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export results: ' + error.message);
    }
  };

  const handleFilterChange = () => {
    fetchResultsData();
  };

  const handleView3D = (ligandId) => {
    setSelectedLigandId(ligandId);
    setActiveTab('visualization');
  };

  const handleDownload = async (ligandId, format = 'pdbqt') => {
    try {
      toast.loading('Preparing download...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/molecules/download/${ligandId}?format=${format}`,
        {
          method: 'GET',
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // If response is not JSON, use the default error message
        }
        throw new Error(errorMessage);
      }

      const contentLength = response.headers.get('Content-Length');
      if (contentLength && parseInt(contentLength) === 0) {
        throw new Error('Download file is empty');
      }

      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `ligand_${ligandId.toString().slice(0, 8)}.${format}`;
      if (contentDisposition) {
        const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (matches && matches[1]) {
          filename = matches[1].replace(/"/g, '');
        }
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);

      toast.success(`${format.toUpperCase()} file downloaded successfully!`);
    } catch (error) {
      console.error('Download failed:', error);
      if (error.name === 'AbortError') {
        toast.error('Download timed out. Please try again.');
      } else {
        toast.error(`Failed to download: ${error.message}`);
      }
    }
  };

  // Statistic Component
  const StatisticCard = ({ title, value, suffix, prefix: Icon, valueColor }) => (
    <Card className="bg-card border-border">
      <CardContent className="pt-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
            <div className="text-2xl font-bold" style={{ color: valueColor }}>
              {value}
              {suffix && <span className="text-sm ml-1">{suffix}</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Pagination
  const paginatedResults = results.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalPages = Math.ceil(results.length / pageSize);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-6 min-h-[400px]">
        <Loading />
        <p className="mt-4 text-foreground">Loading results...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button onClick={fetchResultsData} size="sm">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 bg-background">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Results: {job?.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchResultsData}>Refresh</Button>
          <Button
            variant="primary"
            onClick={handleExportCSV}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Statistics Overview */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatisticCard
            title="Total Results"
            value={statistics.docking_statistics?.total_results || 0}
            prefix={FlaskConical}
          />
          <StatisticCard
            title="Best Affinity"
            value={statistics.docking_statistics?.best_affinity?.toFixed(2) || 'N/A'}
            suffix="kcal/mol"
            valueColor="var(--chart-2)"
          />
          <StatisticCard
            title="Average Affinity"
            value={statistics.docking_statistics?.average_affinity?.toFixed(2) || 'N/A'}
            suffix="kcal/mol"
            valueColor="var(--primary)"
          />
          <StatisticCard
            title="Success Rate"
            value={statistics.success_rate?.toFixed(1) || 0}
            suffix="%"
            valueColor="var(--chart-1)"
          />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="results">Results Table</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
          <TabsTrigger value="visualization">3D Visualization</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="mt-4">
          <Card className="bg-card border-border rounded-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Docking Results</CardTitle>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <TooltipPrimitive.Root>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Filter className="h-4 w-4 text-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Filter by binding affinity range</TooltipContent>
                    </TooltipPrimitive.Root>
                  </TooltipProvider>
                  <Input
                    type="number"
                    placeholder="Min Affinity"
                    value={filters.minAffinity}
                    onChange={(e) => setFilters({...filters, minAffinity: e.target.value})}
                    className="w-32"
                  />
                  <Input
                    type="number"
                    placeholder="Max Affinity"
                    value={filters.maxAffinity}
                    onChange={(e) => setFilters({...filters, maxAffinity: e.target.value})}
                    className="w-32"
                  />
                  <Button onClick={handleFilterChange} size="sm">Apply</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ligand Name</TableHead>
                      <TableHead>Binding Affinity (kcal/mol)</TableHead>
                      <TableHead>RMSD Lower Bound (Å)</TableHead>
                      <TableHead>RMSD Upper Bound (Å)</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Processing Time (s)</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedResults.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Button
                            variant="link"
                            onClick={() => handleView3D(record.ligand_id)}
                            className="p-0 h-auto"
                          >
                            {record.ligand?.name || `Ligand ${record.ligand_id?.toString().slice(0, 8)}`}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={record.binding_affinity < -8 ? 'default' : record.binding_affinity < -6 ? 'secondary' : 'destructive'}
                          >
                            {record.binding_affinity?.toFixed(2)}
                          </Badge>
                        </TableCell>
                        <TableCell>{record.rmsd_lb?.toFixed(2) || 'N/A'}</TableCell>
                        <TableCell>{record.rmsd_ub?.toFixed(2) || 'N/A'}</TableCell>
                        <TableCell>{record.mode}</TableCell>
                        <TableCell>{record.processing_time?.toFixed(2) || 'N/A'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleView3D(record.ligand_id)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View 3D
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(record.ligand_id, 'zip')}
                              title="Download PDBQT and LOG files as ZIP"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              ZIP
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, results.length)} of {results.length} results
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="flex items-center px-3 text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statistics" className="mt-4">
          {statistics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-card border-border rounded-lg">
                <CardHeader>
                  <CardTitle>Affinity Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {statistics.affinity_distribution && statistics.affinity_distribution.length > 0 && (
                    <Plot
                      data={[
                        {
                          x: statistics.affinity_distribution.map(d => d.bin),
                          y: statistics.affinity_distribution.map(d => d.count),
                          type: 'bar',
                          marker: { color: 'var(--primary)' }
                        }
                      ]}
                      layout={{
                        xaxis: { title: 'Binding Affinity (kcal/mol)' },
                        yaxis: { title: 'Count' },
                        height: 300
                      }}
                      config={{ responsive: true }}
                    />
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border-border rounded-lg">
                <CardHeader>
                  <CardTitle>Ligand Properties</CardTitle>
                </CardHeader>
                <CardContent>
                  {statistics.ligand_statistics && (
                    <dl className="space-y-3">
                      <div className="flex justify-between">
                        <dt className="text-sm font-medium text-muted-foreground">Average Molecular Weight:</dt>
                        <dd className="text-sm font-semibold">{statistics.ligand_statistics.average_molecular_weight?.toFixed(2) || 'N/A'} Da</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-sm font-medium text-muted-foreground">Average LogP:</dt>
                        <dd className="text-sm font-semibold">{statistics.ligand_statistics.average_logp?.toFixed(2) || 'N/A'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-sm font-medium text-muted-foreground">Average H-Bond Donors:</dt>
                        <dd className="text-sm font-semibold">{statistics.ligand_statistics.average_hbd?.toFixed(1) || 'N/A'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-sm font-medium text-muted-foreground">Average H-Bond Acceptors:</dt>
                        <dd className="text-sm font-semibold">{statistics.ligand_statistics.average_hba?.toFixed(1) || 'N/A'}</dd>
                      </div>
                    </dl>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="visualization" className="mt-4">
          <Card className="bg-card border-border rounded-lg">
            <CardHeader>
              <CardTitle>Molecular Viewer</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedLigandId ? (
                <NGLMoleculeViewer
                  ligandId={selectedLigandId}
                  jobId={jobId}
                  height={600}
                  showControls={true}
                  viewMode="complex"
                  autoLoad={true}
                />
              ) : (
                <Alert>
                  <AlertDescription>
                    Select a ligand to view - Click on a ligand name in the results table to view its 3D structure
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Results;
