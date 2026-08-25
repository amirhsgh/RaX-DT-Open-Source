import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import apiService from '../services/apiService';
import NGLMoleculeViewer from '../components/MoleculeViewer/NGLMoleculeViewer';

// shadcn/ui imports
import { Button } from '@/components/UI';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/UI';
import { Badge } from '@/components/UI';
import { Alert, AlertDescription } from '@/components/UI';
import { Loading } from '@/components/UI';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/UI';

const Visualization = () => {
  const { jobId, ligandId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [ligand, setLigand] = useState(null);
  const [ligandStructure, setLigandStructure] = useState(null);
  const [proteinStructure, setProteinStructure] = useState(null);
  const [complexStructure, setComplexStructure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('complex'); // 'ligand', 'protein', 'complex'
  const [selectedLigandId, setSelectedLigandId] = useState(ligandId);
  const [availableLigands, setAvailableLigands] = useState([]);

  useEffect(() => {
    if (jobId) {
      fetchVisualizationData();
    }
  }, [jobId, selectedLigandId]);

  const fetchVisualizationData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch job info and available ligands
      const [jobData, ligandsData] = await Promise.allSettled([
        apiService.getJob(jobId),
        apiService.getJobLigands(jobId, 0, 50) // Get first 50 ligands
      ]);

      // Handle job data
      if (jobData.status === 'fulfilled') {
        setJob(jobData.value);
      }

      // Handle ligands data
      if (ligandsData.status === 'fulfilled') {
        setAvailableLigands(ligandsData.value);
        // If no specific ligand selected, use the first one
        if (!selectedLigandId && ligandsData.value.length > 0) {
          setSelectedLigandId(ligandsData.value[0].id);
        }
      }

      // If we have a selected ligand, fetch visualization data
      if (selectedLigandId) {
        const [ligandData, ligandStructureData, proteinStructureData, complexStructureData] = await Promise.allSettled([
          apiService.getLigandDetail(selectedLigandId),
          apiService.getLigandStructureViz(selectedLigandId),
          apiService.getProteinStructureViz(jobId),
          apiService.getComplexStructureViz(selectedLigandId)
        ]);

        // Handle ligand data
        if (ligandData.status === 'fulfilled') {
          setLigand(ligandData.value);
        }

        // Handle ligand structure
        if (ligandStructureData.status === 'fulfilled') {
          setLigandStructure(ligandStructureData.value);
        } else {
          console.warn('Failed to fetch ligand structure:', ligandStructureData.reason);
        }

        // Handle protein structure
        if (proteinStructureData.status === 'fulfilled') {
          setProteinStructure(proteinStructureData.value);
        } else {
          console.warn('Failed to fetch protein structure:', proteinStructureData.reason);
        }

        // Handle complex structure
        if (complexStructureData.status === 'fulfilled') {
          setComplexStructure(complexStructureData.value);
        } else {
          console.warn('Failed to fetch complex structure:', complexStructureData.reason);
        }
      }

    } catch (error) {
      console.error('Failed to fetch visualization data:', error);
      setError('Failed to load visualization data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLigandChange = (newLigandId) => {
    setSelectedLigandId(newLigandId);
    navigate(`/visualization/${jobId}/${newLigandId}`);
  };

  const handleDownloadStructure = () => {
    // Download the current structure based on view mode
    let content = '';
    let filename = '';

    switch (viewMode) {
      case 'ligand':
        content = ligandStructure?.pdb_content || ligandStructure?.pdbqt_content || '';
        filename = `ligand_${selectedLigandId}.pdb`;
        break;
      case 'protein':
        content = proteinStructure?.pdb_content || proteinStructure?.pdbqt_content || '';
        filename = `protein_${jobId}.pdb`;
        break;
      case 'complex':
        content = complexStructure?.protein_content + '\n' + complexStructure?.ligand_content || '';
        filename = `complex_${jobId}_${selectedLigandId}.pdb`;
        break;
      default:
        toast.warning('No structure available for download');
        return;
    }

    if (content) {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Structure downloaded successfully');
    } else {
      toast.warning('No structure content available');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-6 min-h-[400px]">
        <Loading />
        <p className="mt-4 text-foreground">Loading visualization...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button onClick={fetchVisualizationData} size="sm">
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
            onClick={() => navigate(`/results/${jobId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Results
          </Button>
          <h1 className="text-2xl font-bold text-foreground">3D Molecular Visualization</h1>
        </div>
        <div className="flex gap-2">
          <Select value={selectedLigandId} onValueChange={handleLigandChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select ligand" />
            </SelectTrigger>
            <SelectContent>
              {availableLigands.map(ligand => (
                <SelectItem key={ligand.id} value={ligand.id}>
                  {ligand.name || `Ligand ${ligand.id.toString().slice(0, 8)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={viewMode} onValueChange={setViewMode}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ligand">Ligand Only</SelectItem>
              <SelectItem value="protein">Protein Only</SelectItem>
              <SelectItem value="complex">Complex</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleDownloadStructure}
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDB
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card className="bg-card border-border rounded-lg">
            <CardHeader>
              <CardTitle>3D Structure Viewer</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {selectedLigandId ? (
                <NGLMoleculeViewer
                  ligandId={selectedLigandId}
                  jobId={jobId}
                  height={700}
                  showControls={true}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  autoLoad={true}
                />
              ) : (
                <Alert className="m-5">
                  <AlertDescription>
                    Please select a ligand to visualize
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {/* Job Information */}
          {job && (
            <Card className="bg-card border-border rounded-lg">
              <CardHeader>
                <CardTitle>Job Information</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Job Name</dt>
                    <dd className="text-sm font-medium">{job.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Status</dt>
                    <dd>
                      <Badge variant={job.status === 'completed' ? 'default' : 'secondary'}>
                        {job.status}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Progress</dt>
                    <dd className="text-sm font-medium">{job.progress_percentage}%</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Ligand Information */}
          {ligand && (
            <Card className="bg-card border-border rounded-lg">
              <CardHeader>
                <CardTitle>Ligand Properties</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Name</dt>
                    <dd className="text-sm font-medium">{ligand.name || 'Unnamed Ligand'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Molecular Weight</dt>
                    <dd className="text-sm font-medium">{ligand.molecular_weight?.toFixed(2)} Da</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">LogP</dt>
                    <dd className="text-sm font-medium">{ligand.logp?.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">H-Bond Donors</dt>
                    <dd className="text-sm font-medium">{ligand.hbd}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">H-Bond Acceptors</dt>
                    <dd className="text-sm font-medium">{ligand.hba}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Rotatable Bonds</dt>
                    <dd className="text-sm font-medium">{ligand.rotatable_bonds}</dd>
                  </div>
                  {ligand.tpsa && (
                    <div className="flex justify-between">
                      <dt className="text-sm text-muted-foreground">TPSA</dt>
                      <dd className="text-sm font-medium">{ligand.tpsa?.toFixed(2)} Ų</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Binding Information */}
          {complexStructure && (
            <Card className="bg-card border-border rounded-lg">
              <CardHeader>
                <CardTitle>Binding Information</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Binding Affinity</dt>
                    <dd>
                      <Badge
                        variant={
                          complexStructure.binding_affinity < -8 ? 'default' :
                          complexStructure.binding_affinity < -6 ? 'secondary' : 'destructive'
                        }
                      >
                        {complexStructure.binding_affinity?.toFixed(2)} kcal/mol
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Docking Mode</dt>
                    <dd className="text-sm font-medium">{complexStructure.docking_mode || 'N/A'}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Protein Information */}
          {proteinStructure && (
            <Card className="bg-card border-border rounded-lg">
              <CardHeader>
                <CardTitle>Protein Information</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Protein Name</dt>
                    <dd className="text-sm font-medium">{proteinStructure.protein_name}</dd>
                  </div>
                  {proteinStructure.pdb_id && (
                    <div className="flex justify-between">
                      <dt className="text-sm text-muted-foreground">PDB ID</dt>
                      <dd className="text-sm font-medium">{proteinStructure.pdb_id}</dd>
                    </div>
                  )}
                  {proteinStructure.binding_site && (
                    <>
                      <div className="flex flex-col gap-1">
                        <dt className="text-sm text-muted-foreground">Binding Site Center</dt>
                        <dd className="text-sm font-medium">
                          X: {proteinStructure.binding_site.center_x?.toFixed(2)},
                          Y: {proteinStructure.binding_site.center_y?.toFixed(2)},
                          Z: {proteinStructure.binding_site.center_z?.toFixed(2)}
                        </dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt className="text-sm text-muted-foreground">Binding Site Size</dt>
                        <dd className="text-sm font-medium">
                          {proteinStructure.binding_site.size_x?.toFixed(1)} ×
                          {proteinStructure.binding_site.size_y?.toFixed(1)} ×
                          {proteinStructure.binding_site.size_z?.toFixed(1)} Å
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Visualization;
