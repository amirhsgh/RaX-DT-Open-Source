import { ArrowLeftRight, CheckCircle, Database, Download, Filter, FlaskConical, History, Info, Search, Star, X } from 'lucide-react';
import { message } from '../utils/toast';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Tooltip, TooltipProvider } from '../components/UI/tooltip';

import { Progress } from '../components/UI/progress';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/UI/tabs';

import { Alert, AlertDescription, AlertTitle } from '../components/UI/Alert';

import { Badge } from '../components/UI/Badge';

import { Checkbox } from '../components/UI/checkbox';

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../components/UI/form';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/UI/dialog';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI/table';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/UI/select';

import { Input } from '../components/UI/Input';

import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../components/UI/Card';

import { Button } from '../components/UI/Button';

import { Separator } from '../components/UI/separator';

import apiService from '../services/apiService';

const PDBDatabase = () => {
  // Available download formats
  const downloadFormats = [
    {
      value: 'pdb',
      label: 'PDB Format',
      description: '3D structure file (recommended)',
      extension: '.pdb',
      type: '3D'
    },
    {
      value: 'cif',
      label: 'CIF Format',
      description: 'Crystallographic Information File',
      extension: '.cif',
      type: '2D/3D'
    },
    {
      value: 'mmcif',
      label: 'mmCIF Format',
      description: 'Macromolecular CIF format',
      extension: '.cif',
      type: '2D/3D'
    },
    {
      value: 'bcif',
      label: 'BinaryCIF Format',
      description: 'Binary CIF format (compressed)',
      extension: '.bcif',
      type: '2D/3D'
    }
  ];

  // State management
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStructures, setSelectedStructures] = useState([]);
  const [activeTab, setActiveTab] = useState('search');
  const [searchHistory, setSearchHistory] = useState([]);
  const [comparisonData, setComparisonData] = useState(null);
  const [structureDetails, setStructureDetails] = useState(null);

  // Dialog states
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [comparisonDialogOpen, setComparisonDialogOpen] = useState(false);
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [selectedPdbId, setSelectedPdbId] = useState(null);

  // Form instances
  const basicSearchForm = useForm({ defaultValues: { protein_name: '' } });
  const advancedSearchForm = useForm({
    defaultValues: {
      protein_name: '',
      resolution_min: '',
      resolution_max: '',
      exp_method: '',
      release_year_min: '',
      release_year_max: '',
      max_results: 100
    }
  });

  // Search by protein name
  const handleBasicSearch = async (values) => {
    setLoading(true);
    try {
      const response = await apiService.searchPDBByProteinName(
        values.protein_name,
        50
      );

      if (response.success) {
        setSearchResults(response.structures);
        addToSearchHistory('Basic Search', values.protein_name, response.structures.length);
        message.success(`Found ${response.structures.length} structures`);
      } else {
        message.error(response.message || 'Search failed');
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      message.error('Search failed: ' + (error.response?.data?.detail || error.message));
      setSearchResults([]);
    }
    setLoading(false);
  };

  // Advanced search with filters
  const handleAdvancedSearch = async (values) => {
    setLoading(true);
    try {
      // Remove empty values
      const cleanValues = Object.fromEntries(
        Object.entries(values).filter(([_, v]) => v != null && v !== '')
      );

      const response = await apiService.advancedPDBSearch(cleanValues);

      if (response.success) {
        setSearchResults(response.structures);
        addToSearchHistory('Advanced Search', JSON.stringify(cleanValues), response.structures.length);
        message.success(`Found ${response.structures.length} structures`);
        setAdvancedSearchOpen(false);
      } else {
        message.error(response.error || 'Advanced search failed');
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Advanced search error:', error);
      message.error('Advanced search failed: ' + (error.response?.data?.detail || error.message));
      setSearchResults([]);
    }
    setLoading(false);
  };

  // Get structure details
  const handleViewDetails = async (pdbId) => {
    setLoading(true);
    try {
      const response = await apiService.getPDBStructureInfo(pdbId);

      if (response.success) {
        setStructureDetails(response.structure);
        setDetailsDialogOpen(true);
      } else {
        message.error(response.error || 'Failed to get structure details');
      }
    } catch (error) {
      console.error('Details error:', error);
      message.error('Failed to get details: ' + (error.response?.data?.detail || error.message));
    }
    setLoading(false);
  };

  // Open download format selection dialog
  const handleDownloadClick = (pdbId) => {
    setSelectedPdbId(pdbId);
    setDownloadDialogOpen(true);
  };

  // Download structure with selected format
  const handleDownload = async (pdbId, format) => {
    setLoading(true);
    setDownloadDialogOpen(false);

    try {
      // Create download request
      const downloadUrl = `${apiService.baseURL}/pdb/download`;
      const requestBody = {
        pdb_id: pdbId,
        format_type: format
      };

      // Use fetch to get the file as blob
      const response = await fetch(downloadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Download failed');
      }

      // Get filename from response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${pdbId}.${format}`;
      if (contentDisposition) {
        const matches = contentDisposition.match(/filename=([^;]+)/);
        if (matches) {
          filename = matches[1].replace(/"/g, '');
        }
      }

      // Get file data as blob
      const blob = await response.blob();

      // Create download link and trigger download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      message.success(`Structure ${pdbId} downloaded successfully in ${format.toUpperCase()} format`);
    } catch (error) {
      console.error('Download error:', error);
      message.error('Download failed: ' + error.message);
    }
    setLoading(false);
  };

  // Compare selected structures
  const handleCompareStructures = async () => {
    if (selectedStructures.length < 2) {
      message.warning('Select at least 2 structures to compare');
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.comparePDBStructures(selectedStructures);

      if (response.success) {
        setComparisonData(response.comparison);
        setComparisonDialogOpen(true);
        message.success('Structures compared successfully');
      } else {
        message.error(response.error || 'Comparison failed');
      }
    } catch (error) {
      console.error('Comparison error:', error);
      message.error('Comparison failed: ' + (error.response?.data?.detail || error.message));
    }
    setLoading(false);
  };

  // Add to search history
  const addToSearchHistory = (type, query, results) => {
    const newEntry = {
      id: Date.now(),
      type,
      query,
      results,
      timestamp: new Date().toLocaleString()
    };
    setSearchHistory(prev => [newEntry, ...prev.slice(0, 9)]);
  };

  // Quality score color
  const getQualityColor = (score) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    if (score >= 40) return '#fa8c16';
    return '#ff4d4f';
  };

  // Experimental method tag color
  const getExpMethodColor = (method) => {
    if (method.includes('X-RAY')) return 'blue';
    if (method.includes('NMR')) return 'green';
    if (method.includes('ELECTRON')) return 'purple';
    return 'default';
  };

  // Results table columns
  const resultsColumns = [
    {
      title: '',
      key: 'select',
      width: 50,
      render: (_, record) => (
        <Checkbox
          checked={selectedStructures.includes(record.pdb_id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedStructures([...selectedStructures, record.pdb_id]);
            } else {
              setSelectedStructures(selectedStructures.filter(id => id !== record.pdb_id));
            }
          }}
        />
      )
    },
    {
      title: 'PDB ID',
      dataIndex: 'pdb_id',
      key: 'pdb_id',
      width: 80,
      render: (id) => <span className="font-semibold" style={{ color: '#1890ff' }}>{id}</span>
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title) => (
        <Tooltip title={title}>
          <span style={{ color: '#737373' }}>{title}</span>
        </Tooltip>
      )
    },
    {
      title: 'Quality Score',
      dataIndex: 'quality_score',
      key: 'quality_score',
      width: 120,
      sorter: (a, b) => a.quality_score - b.quality_score,
      render: (score) => (
        <div className="flex flex-col space-y-1">
          <Progress
            value={score}
            className="h-2"
            indicatorColor={getQualityColor(score)}
          />
          <span style={{ fontSize: '12px', color: '#737373' }}>{score?.toFixed(1)}/100</span>
        </div>
      )
    },
    {
      title: 'Resolution (Å)',
      dataIndex: 'resolution',
      key: 'resolution',
      width: 100,
      sorter: (a, b) => (a.resolution || 999) - (b.resolution || 999),
      render: (resolution) => (
        resolution ? <span style={{ color: '#737373' }}>{resolution.toFixed(2)}</span> : <span className="text-text-light-secondary dark:text-text-dark-secondary" style={{ color: '#737373' }}>N/A</span>
      )
    },
    {
      title: 'Method',
      dataIndex: 'experimental_method',
      key: 'experimental_method',
      width: 120,
      render: (method) => (
        <Badge variant={getExpMethodColor(method)}>{method.split(' ')[0]}</Badge>
      )
    },
    {
      title: 'Organism(s)',
      dataIndex: 'organisms',
      key: 'organisms',
      width: 150,
      ellipsis: true,
      render: (organisms) => {
        if (!organisms || organisms.length === 0) {
          return <span className="text-text-light-secondary dark:text-text-dark-secondary" style={{ color: '#737373' }}>N/A</span>;
        }
        const names = organisms.map(org => org.scientific_name).join(', ');
        return (
          <Tooltip title={names}>
            <span style={{ fontSize: '12px', color: '#737373' }}>
              {organisms[0].scientific_name}
              {organisms.length > 1 && ` +${organisms.length - 1}`}
            </span>
          </Tooltip>
        );
      }
    },
    {
      title: 'Mutation(s)',
      dataIndex: 'mutations',
      key: 'mutations',
      width: 100,
      render: (mutations) => {
        if (!mutations || mutations.length === 0) {
          return <Badge variant="secondary">None</Badge>;
        }
        const content = mutations.map(m => m.description).join('; ');
        return (
          <Tooltip title={content}>
            <Badge variant="destructive">{mutations.length}</Badge>
          </Tooltip>
        );
      }
    },
    {
      title: 'Chains',
      dataIndex: 'total_chains',
      key: 'total_chains',
      width: 80,
      sorter: (a, b) => (a.total_chains || 0) - (b.total_chains || 0),
      render: (count) => (
        <Badge className="bg-green-500">{count || 0}</Badge>
      )
    },
    {
      title: 'Sequence Length',
      dataIndex: 'sequence_length',
      key: 'sequence_length',
      width: 120,
      sorter: (a, b) => (a.sequence_length || 0) - (b.sequence_length || 0),
      render: (length) => (
        length ? <span style={{ color: '#737373' }}>{length} aa</span> : <span className="text-text-light-secondary dark:text-text-dark-secondary" style={{ color: '#737373' }}>N/A</span>
      )
    },
    {
      title: 'Release Date',
      dataIndex: 'release_date',
      key: 'release_date',
      width: 110,
      render: (date) => <span style={{ fontSize: '12px', color: '#737373' }}>{date}</span>
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <div className="flex items-center space-x-2">
          <Tooltip title="View Details">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewDetails(record.pdb_id)}
            >
              <Info className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip title="Download PDB">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDownloadClick(record.pdb_id)}
            >
              <Download className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      )
    }
  ];

  return (
    <TooltipProvider>
      <div className="min-h-full p-4 md:p-6 space-y-6 molecular-bg">
      {/* Header Section */}
      <div className="bg-background-light-primary dark:bg-background-dark-secondary rounded-2xl shadow-soft border border-border-light-default dark:border-border-dark-subtle p-6 backdrop-blur-sm">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center">
            <Database className="text-2xl text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">
              PDB Database Explorer
            </h1>
            <p className="text-text-light-secondary dark:text-text-dark-secondary">
              Search and explore protein structures from the Protein Data Bank with advanced filtering,
              quality scoring, and comparison tools.
            </p>
          </div>
        </div>
      </div>

      <div className="card-scientific">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="search" className="flex items-center space-x-2">
              <Search className="h-4 w-4" />
              <span>Basic Search</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center space-x-2">
              <History className="h-4 w-4" />
              <span>History</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center space-x-2">
              <FlaskConical className="h-4 w-4" />
              <span>Statistics</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="mt-6">
            <div className="p-6 bg-gradient-molecular rounded-xl">
              <form onSubmit={basicSearchForm.handleSubmit(handleBasicSearch)} className="mb-6">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
                  <div className="lg:col-span-2 space-y-2">
                    <label className="text-sm font-semibold text-text-light-primary dark:text-text-dark-primary">
                      Protein Name
                    </label>
                    <div className="relative">
                      <Input
                        {...basicSearchForm.register('protein_name', { required: 'Please enter protein name' })}
                        placeholder="e.g., insulin, hemoglobin, lysozyme"
                        className="input-scientific pr-24"
                      />
                      <Button
                        type="submit"
                        disabled={loading}
                        className="absolute right-0 top-0 btn-primary"
                      >
                        <Search className="h-4 w-4 mr-2" />
                        Search
                      </Button>
                    </div>
                  </div>
          <div>
            <DialogTrigger asChild>
              <Button
                type="button"
                onClick={() => setAdvancedSearchOpen(true)}
                className="btn-secondary w-full"
              >
                <Filter className="h-4 w-4 mr-2" />
                Advanced
              </Button>
            </DialogTrigger>
          </div>
                  <div>
                    <Button
                      type="button"
                      disabled={selectedStructures.length < 2}
                      onClick={handleCompareStructures}
                      className="btn-secondary w-full disabled:opacity-50"
                    >
                      <ArrowLeftRight className="h-4 w-4 mr-2" />
                      Compare ({selectedStructures.length})
                    </Button>
                  </div>
                </div>
              </form>

            {searchResults.length > 0 && (
              <div className="mb-6 p-4 bg-accent-blue-50 dark:bg-accent-blue-900/20 border border-accent-blue-200 dark:border-accent-blue-800 rounded-xl">
                <div className="flex items-center text-accent-blue-700 dark:text-accent-blue-300">
                  <div className="w-5 h-5 bg-accent-blue-500 rounded-full flex items-center justify-center mr-3">
                    <span className="text-white text-xs">ℹ️</span>
                  </div>
                  <span className="text-sm font-medium">
                    Found {searchResults.length} structures. Results are ranked by quality score.
                  </span>
                </div>
              </div>
            )}

            <div className="bg-background-light-primary dark:bg-background-dark-secondary rounded-xl border border-border-light-default dark:border-border-dark-subtle overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    {resultsColumns.map((col) => (
                      <TableHead key={col.key || col.dataIndex}>
                        <span className="font-semibold text-text-light-primary dark:text-text-dark-white">
                          {col.title}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchResults.length === 0 && !loading ? (
                    <TableRow>
                      <TableCell colSpan={resultsColumns.length} className="text-center py-8 text-muted-foreground">
                        No results found
                      </TableCell>
                    </TableRow>
                  ) : (
                    searchResults.map((record) => (
                      <TableRow key={record.pdb_id}>
                        {resultsColumns.map((col) => (
                          <TableCell key={col.key || col.dataIndex}>
                            {col.render
                              ? col.render(record[col.dataIndex], record)
                              : record[col.dataIndex]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-text-light-primary dark:text-text-dark-primary mb-2">Search History</h3>
                <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">
                  Review your previous database searches
                </p>
              </div>
              <div className="bg-background-light-primary dark:bg-background-dark-secondary rounded-xl border border-border-light-default dark:border-border-dark-subtle overflow-hidden">
                {searchHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-4">📊</div>
                    <div className="text-text-light-secondary dark:text-text-dark-secondary">No search history</div>
                  </div>
                ) : (
                  <div className="divide-y divide-border-light-default dark:divide-border-dark-subtle">
                    {searchHistory.map((item) => (
                      <div key={item.id} className="px-6 py-4 hover:bg-primary-50 dark:hover:bg-background-dark-tertiary transition-colors duration-200 flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
                            <span className="text-white text-sm">🔍</span>
                          </div>
                          <div>
                            <div className="flex items-center space-x-3 mb-1">
                              <Badge variant="default" className="rounded-lg">{item.type}</Badge>
                              <span className="text-text-light-secondary dark:text-text-dark-secondary text-sm">{item.timestamp}</span>
                            </div>
                            <div className="text-text-light-primary dark:text-text-dark-primary">{item.query}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary">
                            {item.results} results
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="stats" className="mt-6">
              <div className="p-6 space-y-6">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-text-light-primary dark:text-text-dark-primary mb-2">Database Statistics</h3>
                  <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">
                    Overview of the Protein Data Bank collection
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="card-scientific group">
                    <div className="p-6 text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                        <Database className="text-2xl text-primary-600 dark:text-primary-400" />
                      </div>
                      <div className="text-3xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">
                        200,000+
                      </div>
                      <div className="text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">
                        Total PDB Structures
                      </div>
                    </div>
                  </div>

                  <div className="card-scientific group">
                    <div className="p-6 text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                        <FlaskConical className="text-2xl text-primary-600 dark:text-primary-400" />
                      </div>
                      <div className="text-3xl font-bold text-primary-600 dark:text-primary-400 mb-2">
                        85%+
                      </div>
                      <div className="text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">
                        X-Ray Structures
                      </div>
                    </div>
                  </div>

                  <div className="card-scientific group">
                    <div className="p-6 text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-accent-orange-100 to-accent-orange-200 dark:from-accent-orange-900/30 dark:to-accent-orange-800/30 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                        <Star className="text-2xl text-accent-orange-600 dark:text-accent-orange-400" />
                      </div>
                      <div className="text-3xl font-bold text-accent-orange-600 dark:text-accent-orange-400 mb-2">
                        25%+
                      </div>
                      <div className="text-sm font-medium text-text-light-secondary dark:text-text-dark-secondary">
                        High Resolution (&lt;1.5Å)
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card-scientific">
                  <div className="p-6 border-b border-border-light-default dark:border-border-dark-subtle">
                    <h4 className="text-lg font-semibold text-text-light-primary dark:text-text-dark-primary">Resolution Distribution</h4>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {[
                        { range: '< 1.5 Å', percent: 25, color: '#22c55e', label: 'High resolution' },
                        { range: '1.5 - 2.5 Å', percent: 45, color: '#3b82f6', label: 'Good resolution' },
                        { range: '2.5 - 3.5 Å', percent: 20, color: '#f97316', label: 'Moderate resolution' },
                        { range: '> 3.5 Å', percent: 10, color: '#ef4444', label: 'Lower resolution' }
                      ].map((item, index) => (
                        <div key={index} className="text-center">
                          <div className="font-semibold text-text-light-primary dark:text-text-dark-primary mb-3">{item.range}</div>
                          <div className="mb-3">
                            <div className="w-full bg-neutral-200 dark:bg-background-dark-tertiary rounded-full h-3">
                              <div
                                className="h-3 rounded-full transition-all duration-500 ease-out"
                                style={{
                                  width: `${item.percent}%`,
                                  backgroundColor: item.color
                                }}
                              ></div>
                            </div>
                            <div className="text-lg font-bold mt-2" style={{ color: item.color }}>
                              {item.percent}%
                            </div>
                          </div>
                          <div className="text-sm text-text-light-secondary dark:text-text-dark-secondary">{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Advanced Search Dialog */}
      <Dialog open={advancedSearchOpen} onOpenChange={setAdvancedSearchOpen}>
        <DialogContent className="max-w-2xl" onClose={() => setAdvancedSearchOpen(false)}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Advanced Search</DialogTitle>
                <DialogDescription>
                  Filter structures with advanced criteria
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={advancedSearchForm.handleSubmit(handleAdvancedSearch)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Protein Name</label>
              <Input
                {...advancedSearchForm.register('protein_name')}
                placeholder="Optional: protein name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Min Resolution (Å)</label>
                <Input
                  type="number"
                  {...advancedSearchForm.register('resolution_min')}
                  placeholder="0.5"
                  step="0.1"
                  min="0.5"
                  max="10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Resolution (Å)</label>
                <Input
                  type="number"
                  {...advancedSearchForm.register('resolution_max')}
                  placeholder="3.0"
                  step="0.1"
                  min="0.5"
                  max="10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Experimental Method</label>
              <Select
                value={advancedSearchForm.watch('exp_method') || ''}
                onValueChange={(value) => advancedSearchForm.setValue('exp_method', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="X-RAY">X-Ray Crystallography</SelectItem>
                  <SelectItem value="NMR">Solution NMR</SelectItem>
                  <SelectItem value="CRYO-EM">Cryo-Electron Microscopy</SelectItem>
                  <SelectItem value="NEUTRON">Neutron Diffraction</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">From Year</label>
                <Input
                  type="number"
                  {...advancedSearchForm.register('release_year_min')}
                  placeholder="2000"
                  min="1970"
                  max="2030"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">To Year</label>
                <Input
                  type="number"
                  {...advancedSearchForm.register('release_year_max')}
                  placeholder="2024"
                  min="1970"
                  max="2030"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Max Results</label>
              <Input
                type="number"
                {...advancedSearchForm.register('max_results')}
                defaultValue="100"
                min="10"
                max="500"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => advancedSearchForm.reset()}
              >
                Reset
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Searching...' : 'Search'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Structure Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {structureDetails ? `Structure Details - ${structureDetails.pdb_id}` : 'Structure Details'}
            </DialogTitle>
          </DialogHeader>

          {structureDetails && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Quality Score</div>
                  <div className="text-2xl font-bold" style={{ color: getQualityColor(structureDetails.quality_score) }}>
                    {structureDetails.quality_score?.toFixed(1)}/100
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Resolution</div>
                  <div className="text-2xl font-bold">
                    {structureDetails.resolution?.toFixed(2) || 'N/A'} Å
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">Title</div>
                  <div className="col-span-2">{structureDetails.title}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">Description</div>
                  <div className="col-span-2">{structureDetails.description}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">Experimental Method</div>
                  <div className="col-span-2">
                    <Badge variant={getExpMethodColor(structureDetails.experimental_method)}>
                      {structureDetails.experimental_method}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">Organism(s)</div>
                  <div className="col-span-2">
                    {structureDetails.organisms && structureDetails.organisms.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {structureDetails.organisms.map((org, idx) => (
                          <Badge key={idx} className="bg-green-500">
                            {org.scientific_name}
                            {org.taxonomy_id && ` (${org.taxonomy_id})`}
                          </Badge>
                        ))}
                      </div>
                    ) : 'N/A'}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">Mutation(s)</div>
                  <div className="col-span-2">
                    {structureDetails.mutations && structureDetails.mutations.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {structureDetails.mutations.map((mut, idx) => (
                          <Badge key={idx} variant="destructive">
                            {mut.type}: {mut.description}
                          </Badge>
                        ))}
                      </div>
                    ) : <Badge variant="secondary">None</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">Chains</div>
                  <div className="col-span-2">
                    {structureDetails.chains && structureDetails.chains.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {structureDetails.chains.map((chain, idx) => (
                          <Badge key={idx} variant="default">
                            {chain.chain_id}
                          </Badge>
                        ))}
                      </div>
                    ) : 'N/A'}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">Sequence Length</div>
                  <div className="col-span-2">
                    {structureDetails.sequence_length ? `${structureDetails.sequence_length} amino acids` : 'N/A'}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">Space Group</div>
                  <div className="col-span-2">{structureDetails.space_group}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">R-factor</div>
                  <div className="col-span-2">{structureDetails.r_factor?.toFixed(3) || 'N/A'}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">R-free</div>
                  <div className="col-span-2">{structureDetails.r_free?.toFixed(3) || 'N/A'}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">Release Date</div>
                  <div className="col-span-2">{structureDetails.release_date}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                  <div className="font-semibold">Keywords</div>
                  <div className="col-span-2">
                    <div className="flex flex-wrap gap-2">
                      {structureDetails.keywords?.map(keyword => (
                        <Badge key={keyword}>{keyword.trim()}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {structureDetails.proteins && structureDetails.proteins.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold">Proteins</h4>
                  {structureDetails.proteins.map((protein, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4 space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="font-semibold">Description</div>
                          <div className="col-span-2">{protein.description}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="font-semibold">Sequence Length</div>
                          <div className="col-span-2">{protein.sequence_length} amino acids</div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="font-semibold">Organism</div>
                          <div className="col-span-2">{protein.organism}</div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                handleDownloadClick(structureDetails?.pdb_id);
                setDetailsDialogOpen(false);
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comparison Dialog */}
      <Dialog open={comparisonDialogOpen} onOpenChange={setComparisonDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Structure Comparison</DialogTitle>
          </DialogHeader>

          {comparisonData && (
            <div className="space-y-6">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Best Recommendation: {comparisonData.best_recommendation.pdb_id}</AlertTitle>
                <AlertDescription>
                  {comparisonData.best_recommendation.reason}
                </AlertDescription>
              </Alert>

              <div className="border rounded-lg overflow-hidden">
                <Table
                  columns={[
                    { title: 'PDB ID', dataIndex: 'pdb_id', key: 'pdb_id', width: 80 },
                    { title: 'Title', dataIndex: 'title', key: 'title', ellipsis: true },
                    {
                      title: 'Quality Score',
                      dataIndex: 'quality_score',
                      key: 'quality_score',
                      render: (score) => (
                        <Badge style={{ backgroundColor: getQualityColor(score) }}>
                          {score?.toFixed(1)}
                        </Badge>
                      )
                    },
                    {
                      title: 'Resolution (Å)',
                      dataIndex: 'resolution',
                      key: 'resolution',
                      render: (res) => res?.toFixed(2) || 'N/A'
                    },
                    {
                      title: 'R-factor',
                      dataIndex: 'r_factor',
                      key: 'r_factor',
                      render: (rf) => rf?.toFixed(3) || 'N/A'
                    },
                    { title: 'Method', dataIndex: 'experimental_method', key: 'method' },
                    { title: 'Release Date', dataIndex: 'release_date', key: 'date' }
                  ]}
                  dataSource={comparisonData.comparison_table}
                  rowKey="pdb_id"
                  pagination={false}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground mb-1">Total Compared</div>
                      <div className="text-2xl font-bold">{comparisonData.statistics.total_structures}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground mb-1">Avg Quality Score</div>
                      <div className="text-2xl font-bold">
                        {comparisonData.statistics.quality_score_stats.avg?.toFixed(1)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground mb-1">Best Resolution</div>
                      <div className="text-2xl font-bold">
                        {comparisonData.statistics.resolution_stats.min?.toFixed(2)} Å
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setComparisonDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download Format Selection Dialog */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select Download Format</DialogTitle>
            <DialogDescription>
              Choose the format for downloading structure <strong>{selectedPdbId}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            {downloadFormats.map((format) => (
              <Card
                key={format.value}
                className={`cursor-pointer hover:shadow-lg transition-shadow ${
                  format.value === 'pdb' ? 'border-green-500 border-2' : ''
                }`}
                onClick={() => handleDownload(selectedPdbId, format.value)}
              >
                <CardContent className="p-6 text-center space-y-3">
                  <Download
                    className="h-8 w-8 mx-auto"
                    style={{ color: format.value === 'pdb' ? '#52c41a' : '#1890ff' }}
                  />
                  <h5 className="text-base font-semibold">{format.label}</h5>
                  <p className="text-sm text-muted-foreground">{format.description}</p>
                  <div className="flex justify-center gap-2">
                    <Badge variant={format.value === 'pdb' ? 'default' : 'secondary'}>
                      {format.extension}
                    </Badge>
                    {format.type && <Badge variant="outline">{format.type}</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center text-sm text-muted-foreground mt-4">
            💡 PDB: 3D structure (recommended) | CIF: Standard format | mmCIF: Large structures | BinaryCIF: Compressed binary
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default PDBDatabase;
