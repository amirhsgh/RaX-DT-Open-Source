import { Camera, Download, Maximize, Minimize, RefreshCw, Loader2 } from 'lucide-react';
import { message } from '../../utils/toast';
import React, { useEffect, useRef, useState } from 'react';
import { TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/UI/tooltip.jsx';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { Alert, AlertTitle, AlertDescription } from '../../components/UI/Alert';

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/UI/select.jsx';

import { Card, CardHeader, CardTitle, CardContent } from '../../components/UI/Card';

import { Button } from '../../components/UI/Button';
import { Loading } from '../UI/Loading';

import apiService from '../../services/apiService';
import './MoleculeViewer.css';

const NGLMoleculeViewer = ({ 
  ligandId, 
  jobId, 
  height = 600,
  showControls = true,
  viewMode = 'complex',
  onViewModeChange,
  className = '',
  autoLoad = true
}) => {
  // Refs
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  
  // States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nglLoaded, setNglLoaded] = useState(false);
  const [moleculesLoaded, setMoleculesLoaded] = useState(false);
  
  // Viewer settings
  const [currentView, setCurrentView] = useState(viewMode);
  const [proteinStyle, setProteinStyle] = useState('cartoon');
  const [ligandStyle, setLigandStyle] = useState('ball+stick');
  const [backgroundColor, setBackgroundColor] = useState('white');
  const [quality, setQuality] = useState('medium');
  
  // Model selection states
  const [selectedProteinModel, setSelectedProteinModel] = useState(0);
  const [selectedLigandModel, setSelectedLigandModel] = useState(0);
  const [availableModels, setAvailableModels] = useState({
    protein: [],
    ligand: []
  });
  
  // Data and components
  const [structures, setStructures] = useState({
    protein: null,
    ligand: null,
    complex: null
  });
  
  const [components, setComponents] = useState({
    protein: null,
    ligand: null
  });

  // Pose-specific data
  const [poseAffinities, setPoseAffinities] = useState([]);

  // Load NGL library
  useEffect(() => {
    const loadNGL = () => {
      if (window.NGL) {
        setNglLoaded(true);
        initializeStage();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/ngl@2.0.0-dev.39/dist/ngl.js';
      script.async = true;
      script.onload = () => {
        setNglLoaded(true);
        initializeStage();
      };
      script.onerror = () => {
        setError('Failed to load NGL viewer library');
        setLoading(false);
      };
      document.head.appendChild(script);
    };

    loadNGL();

    return () => {
      if (stageRef.current) {
        try {
          stageRef.current.dispose();
        } catch (e) {
          console.warn('Error disposing stage:', e);
        }
      }
    };
  }, []);

  // Sync viewMode prop with internal state
  useEffect(() => {
    if (viewMode && viewMode !== currentView) {
      setCurrentView(viewMode);
    }
  }, [viewMode]);

  // Load data when NGL is ready
  useEffect(() => {
    if (nglLoaded && stageRef.current && autoLoad && (ligandId || jobId)) {
      loadStructureData();
    }
  }, [nglLoaded, ligandId, jobId, autoLoad]);

  // Update view when data or settings change
  useEffect(() => {
    if (nglLoaded && stageRef.current && (structures.protein || structures.ligand)) {
      updateMolecularView();
    }
  }, [structures, currentView, nglLoaded]);

  // Reset selected models when data changes
  useEffect(() => {
    setSelectedProteinModel(0);
    setSelectedLigandModel(0);
  }, [ligandId, jobId]);

  // Update available models when pose affinities are loaded
  useEffect(() => {
    if (poseAffinities.length > 0 && availableModels.ligand.length > 0) {
      const updatedModels = { ...availableModels };
      updatedModels.ligand = updatedModels.ligand.map(model => {
        const poseData = poseAffinities.find(p => p.pose_index === model.index);
        let label = `Pose ${model.index + 1}`;
        
        if (poseData && poseData.binding_affinity) {
          label = `Pose ${model.index + 1} (${poseData.binding_affinity.toFixed(1)} kcal/mol)`;
        }
        
        return {
          ...model,
          label: label,
          affinity: poseData?.binding_affinity || null,
          intramol: poseData?.intramol_energy || null,
          cnn: poseData?.cnn_score || null
        };
      });
      
      setAvailableModels(updatedModels);
    }
  }, [poseAffinities]);

  const initializeStage = () => {
    if (!window.NGL || !containerRef.current) return;

    try {
      setLoading(true);
      
      const stage = new window.NGL.Stage(containerRef.current, {
        backgroundColor: backgroundColor,
        quality: quality,
        sampleLevel: quality === 'high' ? 2 : 1,
        workerDefault: true,
        impostor: true,
        antialias: true,
        clipNear: 0,
        clipFar: 100,
        clipScale: 'relative'
      });
      
      stageRef.current = stage;
      
      // Handle resize events
      stage.handleResize();
      
      console.log('✅ NGL stage initialized');
      setLoading(false);
      
    } catch (err) {
      setError('Failed to initialize NGL molecular viewer');
      setLoading(false);
      console.error('NGL stage initialization error:', err);
    }
  };

  const loadStructureData = async () => {
    if (!ligandId && !jobId) return;
    
    try {
      setLoading(true);
      const newStructures = { ...structures };

      // Load protein data
      if (jobId) {
        try {
          console.log('📡 Fetching protein structure...');
          const proteinData = await apiService.getProteinStructureViz(jobId);
          if (proteinData && (proteinData.pdb_content || proteinData.pdbqt_content)) {
            newStructures.protein = proteinData.pdb_content || proteinData.pdbqt_content;
            console.log('✅ Protein data loaded, size:', newStructures.protein.length);
          }
        } catch (error) {
          console.warn('❌ Failed to load protein:', error);
        }
      }

      // Load ligand data
      if (ligandId) {
        try {
          console.log('📡 Fetching ligand structure...');
          const ligandData = await apiService.getLigandStructureViz(ligandId, true);
          if (ligandData) {
            newStructures.ligand = ligandData.docked_structure || ligandData.pdb_content || ligandData.pdbqt_content;
            console.log('✅ Ligand data loaded, size:', newStructures.ligand?.length || 0);
          }
        } catch (error) {
          console.warn('❌ Failed to load ligand:', error);
        }
      }

      // Load pose affinities
      if (ligandId) {
        try {
          const posesData = await apiService.getLigandPoses(ligandId);
          if (posesData && posesData.poses) {
            setPoseAffinities(posesData.poses);
            console.log('✅ Pose affinities loaded:', posesData.poses.length, 'poses');
          }
        } catch (error) {
          console.warn('❌ Failed to load pose affinities:', error);
        }
      }

      // Load complex data for additional info
      if (ligandId) {
        try {
          const complexData = await apiService.getComplexStructureViz(ligandId);
          if (complexData) {
            newStructures.complex = complexData;
            console.log('✅ Complex data loaded');
          }
        } catch (error) {
          console.warn('❌ Failed to load complex:', error);
        }
      }

      setStructures(newStructures);
      setLoading(false);
      
    } catch (error) {
      console.error('Error loading structure data:', error);
      setError('Failed to load molecular structures');
      setLoading(false);
    }
  };

  const updateMolecularView = async () => {
    if (!stageRef.current || !window.NGL) return;

    try {
      setLoading(true);
      setError(null);
      
      const stage = stageRef.current;
      
      // Clear existing components
      stage.removeAllComponents();
      
      const newComponents = { protein: null, ligand: null };
      const newAvailableModels = { protein: [], ligand: [] };
      let hasContent = false;

      // Load protein
      if (structures.protein && (currentView === 'protein' || currentView === 'complex')) {
        try {
          console.log('🧬 Loading protein with NGL...');
          
          // Create blob from protein data
          const proteinBlob = new Blob([structures.protein], { type: 'text/plain' });
          const proteinFile = new File([proteinBlob], 'protein.pdb', { type: 'text/plain' });
          
          const proteinComponent = await stage.loadFile(proteinFile, { 
            format: detectFormat(structures.protein),
            firstModelOnly: false,
            cAlphaOnly: false
          });
          
          // Detect available models
          const proteinModelCount = proteinComponent.structure.modelStore.count;
          console.log(`🧬 Protein has ${proteinModelCount} models`);
          
          // Create model list for selector
          for (let i = 0; i < proteinModelCount; i++) {
            newAvailableModels.protein.push({
              index: i,
              label: `Model ${i + 1}`
            });
          }
          
          // Apply protein representation with selected model
          applyProteinRepresentation(proteinComponent, selectedProteinModel);
          
          newComponents.protein = proteinComponent;
          hasContent = true;
          console.log('✅ Protein loaded successfully');
          
        } catch (error) {
          console.error('Error loading protein:', error);
          message.warning('Failed to load protein structure');
        }
      }

      // Load ligand
      if (structures.ligand && (currentView === 'ligand' || currentView === 'complex')) {
        try {
          console.log('💊 Loading ligand with NGL...');
          
          // Create blob from ligand data
          const ligandBlob = new Blob([structures.ligand], { type: 'text/plain' });
          const ligandFile = new File([ligandBlob], 'ligand.pdb', { type: 'text/plain' });
          
          const ligandComponent = await stage.loadFile(ligandFile, { 
            format: detectFormat(structures.ligand),
            firstModelOnly: false
          });
          
          // Detect available models
          const ligandModelCount = ligandComponent.structure.modelStore.count;
          console.log(`💊 Ligand has ${ligandModelCount} models`);
          
          // Create model list for selector with affinity info
          for (let i = 0; i < ligandModelCount; i++) {
            let label = `Pose ${i + 1}`;
            
            // Add affinity info if available
            const poseData = poseAffinities.find(p => p.pose_index === i);
            if (poseData && poseData.binding_affinity) {
              label = `Pose ${i + 1} (${poseData.binding_affinity.toFixed(1)} kcal/mol)`;
            }
            
            newAvailableModels.ligand.push({
              index: i,
              label: label,
              affinity: poseData?.binding_affinity || null,
              intramol: poseData?.intramol_energy || null,
              cnn: poseData?.cnn_score || null
            });
          }
          
          // Apply ligand representation with selected model
          applyLigandRepresentation(ligandComponent, selectedLigandModel);
          
          newComponents.ligand = ligandComponent;
          hasContent = true;
          console.log('✅ Ligand loaded successfully');
          
        } catch (error) {
          console.error('Error loading ligand:', error);
          message.warning('Failed to load ligand structure');
        }
      }

      setComponents(newComponents);
      setAvailableModels(newAvailableModels);

      if (hasContent) {
        setMoleculesLoaded(true);
        setError(null);
        console.log('🎉 All molecules rendered successfully');

        // Auto-center the view with a small delay to ensure proper rendering
        setTimeout(() => {
          if (stageRef.current) {
            stageRef.current.autoView(1000); // 1 second transition
          }
        }, 100);
      } else {
        setMoleculesLoaded(false);
        if (!structures.protein && !structures.ligand) {
          setError('No structure data available');
        }
      }

      setLoading(false);
      
    } catch (error) {
      console.error('Error updating molecular view:', error);
      setError('Failed to render molecular structures: ' + error.message);
      setLoading(false);
    }
  };

  const detectFormat = (content) => {
    if (!content) return 'pdb';
    if (content.includes('ROOT') && content.includes('ENDROOT')) return 'pdb'; // NGL treats PDBQT as PDB
    if (content.includes('TORSDOF')) return 'pdb';
    if (content.includes('$$$$')) return 'sdf';
    if (content.includes('@<TRIPOS>MOLECULE')) return 'mol2';
    if (content.includes('ATOM') || content.includes('HETATM')) return 'pdb';
    return 'pdb';
  };

  const applyProteinRepresentation = (component, modelIndex = 0) => {
    // Remove existing representations
    component.removeAllRepresentations();
    
    const opacity = currentView === 'complex' ? 0.8 : 1.0;
    const sele = modelIndex !== undefined ? `/${modelIndex}` : '';
    
    switch (proteinStyle) {
      case 'cartoon':
        component.addRepresentation('cartoon', {
          colorScheme: 'chainname',
          opacity: opacity,
          quality: quality,
          sele: sele
        });
        break;
      case 'surface':
        component.addRepresentation('surface', {
          colorScheme: 'hydrophobicity',
          opacity: 0.7,
          surfaceType: 'ms',
          sele: sele
        });
        break;
      case 'ribbon':
        component.addRepresentation('ribbon', {
          colorScheme: 'secondaryStructure',
          opacity: opacity,
          sele: sele
        });
        break;
      case 'backbone':
        component.addRepresentation('backbone', {
          colorScheme: 'chainname',
          opacity: opacity,
          sele: sele
        });
        break;
      case 'ball+stick':
        component.addRepresentation('ball+stick', {
          colorScheme: 'element',
          opacity: opacity,
          radiusScale: 0.3,
          sele: sele
        });
        break;
      default:
        component.addRepresentation('cartoon', {
          colorScheme: 'chainname',
          opacity: opacity,
          sele: sele
        });
    }
  };

  const applyLigandRepresentation = (component, modelIndex = 0) => {
    // Remove existing representations
    component.removeAllRepresentations();
    
    const sele = modelIndex !== undefined ? `/${modelIndex}` : '';
    
    switch (ligandStyle) {
      case 'ball+stick':
        component.addRepresentation('ball+stick', {
          colorScheme: 'element',
          radiusScale: 0.8,
          quality: quality,
          sele: sele
        });
        break;
      case 'licorice':
        component.addRepresentation('licorice', {
          colorScheme: 'element',
          quality: quality,
          sele: sele
        });
        break;
      case 'spacefill':
        component.addRepresentation('spacefill', {
          colorScheme: 'element',
          radiusScale: 0.7,
          sele: sele
        });
        break;
      case 'line':
        component.addRepresentation('line', {
          colorScheme: 'element',
          sele: sele
        });
        break;
      case 'surface':
        component.addRepresentation('surface', {
          colorScheme: 'element',
          opacity: 0.8,
          sele: sele
        });
        break;
      default:
        component.addRepresentation('ball+stick', {
          colorScheme: 'element',
          radiusScale: 0.8,
          sele: sele
        });
    }
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
    if (onViewModeChange) {
      onViewModeChange(view);
    }
  };

  const handleProteinStyleChange = (style) => {
    setProteinStyle(style);
    if (components.protein) {
      applyProteinRepresentation(components.protein, selectedProteinModel);
    }
  };

  const handleLigandStyleChange = (style) => {
    setLigandStyle(style);
    if (components.ligand) {
      applyLigandRepresentation(components.ligand, selectedLigandModel);
    }
  };

  const handleProteinModelChange = (modelIndex) => {
    setSelectedProteinModel(modelIndex);
    if (components.protein) {
      applyProteinRepresentation(components.protein, modelIndex);
      stageRef.current?.autoView();
    }
  };

  const handleLigandModelChange = (modelIndex) => {
    setSelectedLigandModel(modelIndex);
    if (components.ligand) {
      applyLigandRepresentation(components.ligand, modelIndex);
      stageRef.current?.autoView();
    }
  };

  const handleBackgroundChange = (color) => {
    setBackgroundColor(color);
    if (stageRef.current) {
      stageRef.current.setParameters({ backgroundColor: color });
    }
  };

  const handleQualityChange = (newQuality) => {
    setQuality(newQuality);
    if (stageRef.current) {
      stageRef.current.setParameters({ 
        quality: newQuality,
        sampleLevel: newQuality === 'high' ? 2 : 1 
      });
      // Reapply representations with new quality
      if (components.protein) applyProteinRepresentation(components.protein, selectedProteinModel);
      if (components.ligand) applyLigandRepresentation(components.ligand, selectedLigandModel);
    }
  };

  const handleScreenshot = () => {
    if (!stageRef.current || !moleculesLoaded) {
      message.warning('No structure loaded to capture');
      return;
    }

    try {
      stageRef.current.makeImage({
        factor: 2,
        antialias: true,
        trim: false,
        transparent: false
      }).then(function(blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `molecular_structure_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        message.success('Screenshot saved successfully');
      });
    } catch (error) {
      console.error('Screenshot failed:', error);
      message.error('Failed to save screenshot');
    }
  };

  const handleDownloadPose = async (format = 'pdbqt') => {
    if (!ligandId || selectedLigandModel === null) {
      message.warning('No pose selected to download');
      return;
    }

    try {
      const result = await apiService.downloadPose(ligandId, selectedLigandModel, format);
      message.success(`Pose ${selectedLigandModel + 1} downloaded as ${result.filename}`);
    } catch (error) {
      console.error('Download failed:', error);
      message.error('Failed to download pose: ' + error.message);
    }
  };

  const handleReload = () => {
    if (autoLoad && (ligandId || jobId)) {
      loadStructureData();
    } else {
      updateMolecularView();
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen && containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else if (isFullscreen && document.exitFullscreen) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Handle fullscreen events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (stageRef.current) {
        setTimeout(() => {
          try {
            stageRef.current.handleResize();
          } catch (e) {
            console.warn('Error during resize:', e);
          }
        }, 100);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handle window resize
  useEffect(() => {
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (stageRef.current) {
          try {
            stageRef.current.handleResize();
          } catch (e) {
            console.warn('Error during resize:', e);
          }
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertTitle>NGL Viewer Error</AlertTitle>
            <AlertDescription>
              <div className="mb-4">{error}</div>
              <Button size="sm" onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`molecule-viewer-card ${isFullscreen ? 'fullscreen' : ''} ${className}`}
    >
      {showControls && (
        <CardHeader>
          <div className="flex flex-col space-y-4">
            <CardTitle>NGL Molecular Viewer</CardTitle>
            <TooltipProvider>
              <div className="flex flex-wrap items-center gap-2">
            <Select value={currentView} onValueChange={handleViewChange}>
              <SelectTrigger className="w-[110px] h-8">
                <SelectValue placeholder="View Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ligand">Ligand</SelectItem>
                <SelectItem value="protein">Protein</SelectItem>
                <SelectItem value="complex">Complex</SelectItem>
              </SelectContent>
            </Select>

            {(currentView === 'protein' || currentView === 'complex') && (
              <Select value={proteinStyle} onValueChange={handleProteinStyleChange}>
                <SelectTrigger className="w-[100px] h-8">
                  <SelectValue placeholder="Protein Style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cartoon">Cartoon</SelectItem>
                  <SelectItem value="surface">Surface</SelectItem>
                  <SelectItem value="ribbon">Ribbon</SelectItem>
                  <SelectItem value="backbone">Backbone</SelectItem>
                  <SelectItem value="ball+stick">Ball+Stick</SelectItem>
                </SelectContent>
              </Select>
            )}

            {moleculesLoaded && components.protein && availableModels.protein.length > 1 && (
              <Select value={selectedProteinModel} onValueChange={handleProteinModelChange}>
                <SelectTrigger className="w-[100px] h-8">
                  <SelectValue placeholder="Protein Model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.protein.map((model, index) => (
                    <SelectItem key={index} value={model.index}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {(currentView === 'ligand' || currentView === 'complex') && (
              <Select value={ligandStyle} onValueChange={handleLigandStyleChange}>
                <SelectTrigger className="w-[110px] h-8">
                  <SelectValue placeholder="Ligand Style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ball+stick">Ball+Stick</SelectItem>
                  <SelectItem value="licorice">Licorice</SelectItem>
                  <SelectItem value="spacefill">Spacefill</SelectItem>
                  <SelectItem value="line">Line</SelectItem>
                  <SelectItem value="surface">Surface</SelectItem>
                </SelectContent>
              </Select>
            )}

            {moleculesLoaded && components.ligand && availableModels.ligand.length > 1 && (
              <Select value={selectedLigandModel} onValueChange={handleLigandModelChange}>
                <SelectTrigger className="w-[180px] h-8">
                  <SelectValue placeholder="Ligand Pose" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.ligand.map((model, index) => (
                    <SelectItem key={index} value={model.index}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={quality} onValueChange={handleQualityChange}>
              <SelectTrigger className="w-[90px] h-8">
                <SelectValue placeholder="Quality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>

            <Select value={backgroundColor} onValueChange={handleBackgroundChange}>
              <SelectTrigger className="w-[90px] h-8">
                <SelectValue placeholder="Background" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="white">White</SelectItem>
                <SelectItem value="black">Black</SelectItem>
                <SelectItem value="gray">Gray</SelectItem>
                <SelectItem value="#f0f0f0">Light</SelectItem>
              </SelectContent>
            </Select>

          <TooltipPrimitive.Root>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleScreenshot}
                disabled={!moleculesLoaded}
                className="h-8 w-8"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Screenshot</TooltipContent>
          </TooltipPrimitive.Root>

          {moleculesLoaded && components.ligand && (
            <TooltipPrimitive.Root>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDownloadPose('pdbqt')}
                  className="h-8 w-8"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download Current Pose</TooltipContent>
            </TooltipPrimitive.Root>
          )}

          <TooltipPrimitive.Root>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleReload}
                loading={loading}
                disabled={loading}
                className="h-8 w-8"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload</TooltipContent>
          </TooltipPrimitive.Root>

          <TooltipPrimitive.Root>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className="h-8 w-8"
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fullscreen</TooltipContent>
          </TooltipPrimitive.Root>
              </div>
            </TooltipProvider>
          </div>
        </CardHeader>
      )}
      <CardContent>
        <div style={{ position: 'relative', height: isFullscreen ? '100vh' : height }}>
        {/* Loading overlay */}
        {loading && (
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              zIndex: 10,
              flexDirection: 'column',
              gap: 16
            }}
          >
            <Loading size="large" />
            <div>Loading NGL molecular viewer...</div>
          </div>
        )}

        {/* No data message */}
        {!loading && !moleculesLoaded && !structures.protein && !structures.ligand && (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <Alert variant="info">
              <AlertTitle>No Structure Data</AlertTitle>
              <AlertDescription>No molecular structure data available to display</AlertDescription>
            </Alert>
          </div>
        )}

        {/* NGL Viewer Container */}
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: '100%',
            minHeight: `${height}px`,
            border: '1px solid #d9d9d9',
            borderRadius: 6,
            backgroundColor: backgroundColor,
            position: 'relative'
          }}
        />

        {/* Status indicators */}
        {moleculesLoaded && showControls && (
          <>
            {/* Controls info */}
            <div 
              style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '6px 10px',
                borderRadius: 4,
                fontSize: 11,
                zIndex: 5
              }}
            >
              🖱️ Left-click: rotate | Right-click: pan | Scroll: zoom
            </div>

            {/* Load status */}
            <div 
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                padding: '8px 12px',
                borderRadius: 4,
                fontSize: 12,
                zIndex: 5,
                border: '1px solid #d9d9d9'
              }}
            >
              <div>
                🧬 Protein: {components.protein ? '✅' : '❌'} 
                {structures.protein ? ` (${Math.round(structures.protein.length/1024)}KB)` : ''}
                {availableModels.protein.length > 1 && ` | ${availableModels.protein.length} models`}
                {availableModels.protein.length > 1 && ` | showing #${selectedProteinModel + 1}`}
              </div>
              <div>
                💊 Ligand: {components.ligand ? '✅' : '❌'}
                {structures.ligand ? ` (${Math.round(structures.ligand.length/1024)}KB)` : ''}
                {availableModels.ligand.length > 1 && ` | ${availableModels.ligand.length} poses`}
                {availableModels.ligand.length > 1 && ` | showing #${selectedLigandModel + 1}`}
              </div>
            </div>

            {/* Binding affinity info for current pose */}
            {(() => {
              const currentPose = availableModels.ligand.find(model => model.index === selectedLigandModel);
              const affinity = currentPose?.affinity || structures.complex?.binding_affinity;
              
              if (affinity) {
                return (
                  <div 
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      color: 'white',
                      padding: '8px 12px',
                      borderRadius: 4,
                      fontSize: 12,
                      zIndex: 5
                    }}
                  >
                    <div>⚡ Binding Affinity: {affinity.toFixed(2)} kcal/mol</div>
                    {currentPose?.intramol && (
                      <div>🔗 Intramol Energy: {currentPose.intramol.toFixed(2)}</div>
                    )}
                    {currentPose?.cnn && (
                      <div>🧠 CNN Score: {currentPose.cnn.toFixed(3)}</div>
                    )}
                  </div>
                );
              }
              return null;
            })()}
          </>
        )}
        </div>
      </CardContent>
    </Card>
  );
};

export default NGLMoleculeViewer;