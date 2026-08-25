import React, { useState, useRef, useEffect } from 'react';
import { Inbox, Box, Target, RefreshCw, AlertCircle } from 'lucide-react';
import { message } from '../utils/toast';
import { useForm } from 'react-hook-form';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import { Alert, AlertTitle, AlertDescription } from '../components/UI/Alert';
import { Badge } from '../components/UI/Badge';

const BindingBoxComparator = () => {
  const containerRef = useRef(null);
  const stageRef = useRef(null);

  const [proteinFile, setProteinFile] = useState(null);
  const [ligandFile, setLigandFile] = useState(null);
  const [nglLoaded, setNglLoaded] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ligandCenter, setLigandCenter] = useState(null);
  const [distance, setDistance] = useState(null);
  const [isMatch, setIsMatch] = useState(null);
  const [boxShapeRef, setBoxShapeRef] = useState(null);

  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      x: '',
      y: '',
      z: '',
      radius: '10'
    }
  });

  const watchedValues = watch();

  // Load NGL library
  useEffect(() => {
    const loadNGL = () => {
      if (window.NGL) {
        setNglLoaded(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/ngl@2.0.0-dev.39/dist/ngl.js';
      script.async = true;
      script.onload = () => {
        setNglLoaded(true);
      };
      script.onerror = () => {
        setError('Failed to load NGL viewer library');
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

  // Initialize NGL stage when loaded
  useEffect(() => {
    if (nglLoaded && containerRef.current && !stageRef.current) {
      initializeStage();
    }
  }, [nglLoaded]);

  const initializeStage = () => {
    if (!window.NGL || !containerRef.current || stageRef.current) return;

    try {
      const stage = new window.NGL.Stage(containerRef.current, {
        backgroundColor: 'white',
        quality: 'medium',
        sampleLevel: 1,
        workerDefault: true,
        impostor: true,
        antialias: true,
        clipNear: 0,
        clipFar: 100,
        clipScale: 'relative'
      });

      stageRef.current = stage;
      stage.handleResize();
      setViewerReady(true);
      console.log('✅ NGL stage initialized');
    } catch (err) {
      setError('Failed to initialize NGL molecular viewer');
      console.error('NGL stage initialization error:', err);
    }
  };

  const handleProteinUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setProteinFile(file);
      message.success(`${file.name} selected`);
    }
  };

  const handleLigandUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLigandFile(file);
      message.success(`${file.name} selected`);
    }
  };

  const calculateLigandCenter = (component) => {
    try {
      const structure = component.structure;
      let sumX = 0, sumY = 0, sumZ = 0, count = 0;

      structure.eachAtom((atom) => {
        sumX += atom.x;
        sumY += atom.y;
        sumZ += atom.z;
        count++;
      });

      if (count > 0) {
        return {
          x: sumX / count,
          y: sumY / count,
          z: sumZ / count
        };
      }
      return null;
    } catch (err) {
      console.error('Error calculating ligand center:', err);
      return null;
    }
  };

  const calculateDistance = (point1, point2) => {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    const dz = point1.z - point2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  const drawBindingBox = (x, y, z, radius) => {
    if (!stageRef.current || !window.NGL) return;

    // Remove existing box if any
    if (boxShapeRef) {
      stageRef.current.removeComponent(boxShapeRef);
    }

    try {
      const shape = new window.NGL.Shape('binding-box');

      // Draw a red box (cube)
      const halfSize = radius / 2;

      // Define 8 vertices of the cube
      const vertices = [
        [x - halfSize, y - halfSize, z - halfSize], // 0: front-bottom-left
        [x + halfSize, y - halfSize, z - halfSize], // 1: front-bottom-right
        [x + halfSize, y + halfSize, z - halfSize], // 2: front-top-right
        [x - halfSize, y + halfSize, z - halfSize], // 3: front-top-left
        [x - halfSize, y - halfSize, z + halfSize], // 4: back-bottom-left
        [x + halfSize, y - halfSize, z + halfSize], // 5: back-bottom-right
        [x + halfSize, y + halfSize, z + halfSize], // 6: back-top-right
        [x - halfSize, y + halfSize, z + halfSize]  // 7: back-top-left
      ];

      // Define 12 edges of the cube
      const edges = [
        // Front face
        [0, 1], [1, 2], [2, 3], [3, 0],
        // Back face
        [4, 5], [5, 6], [6, 7], [7, 4],
        // Connecting edges
        [0, 4], [1, 5], [2, 6], [3, 7]
      ];

      // Draw all edges with cylinders (red color, thicker for visibility)
      const edgeRadius = 0.3; // Thicker edges for better visibility
      const redColor = [1, 0, 0]; // RGB for red

      edges.forEach(([i, j]) => {
        shape.addCylinder(
          vertices[i],
          vertices[j],
          redColor,
          edgeRadius
        );
      });

      // Add mesh for 6 faces to fill the box (توپر کردن باکس)
      // Create mesh arrays
      const meshPosition = [];
      const meshColor = [];

      // Define faces as triangles (2 triangles per face = 6 vertices per face)
      const faces = [
        // Front face (z-): vertices 0,1,2 and 0,2,3
        [0, 1, 2, 0, 2, 3],
        // Back face (z+): vertices 4,5,6 and 4,6,7
        [4, 5, 6, 4, 6, 7],
        // Bottom face (y-): vertices 0,1,5 and 0,5,4
        [0, 1, 5, 0, 5, 4],
        // Top face (y+): vertices 3,2,6 and 3,6,7
        [3, 2, 6, 3, 6, 7],
        // Left face (x-): vertices 0,3,7 and 0,7,4
        [0, 3, 7, 0, 7, 4],
        // Right face (x+): vertices 1,2,6 and 1,6,5
        [1, 2, 6, 1, 6, 5]
      ];

      // Build mesh from faces
      faces.forEach(faceIndices => {
        faceIndices.forEach(idx => {
          meshPosition.push(...vertices[idx]);
          meshColor.push(...redColor);
        });
      });

      // Add mesh to shape
      shape.addMesh(
        meshPosition,
        meshColor
      );

      // Add a sphere at the center to mark the binding site center
      shape.addSphere([x, y, z], redColor, 0.7, 'Center');

      // Add the shape to the stage
      const shapeComp = stageRef.current.addComponentFromObject(shape);

      // Use buffer representation with proper settings for transparency
      shapeComp.addRepresentation('buffer', {
        opacity: 0.4, // Semi-transparent so we can see inside
        flatShaded: false,
        side: 'double', // Show both sides of faces
        wireframe: false
      });

      setBoxShapeRef(shapeComp);
      console.log('✅ Binding box drawn at', x, y, z, 'with size', radius);
      message.success('Binding box displayed successfully!');
    } catch (err) {
      console.error('Error drawing binding box:', err);
      message.error('Failed to draw binding box: ' + err.message);
    }
  };

  const onSubmit = async (data) => {
    if (!proteinFile) {
      message.error('Please upload protein structure file');
      return;
    }

    if (!data.x || !data.y || !data.z || !data.radius) {
      message.error('Please enter all coordinates and radius');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const stage = stageRef.current;

      // Clear existing components
      stage.removeAllComponents();
      setBoxShapeRef(null);
      setLigandCenter(null);
      setDistance(null);
      setIsMatch(null);

      // Load protein
      const proteinComponent = await stage.loadFile(proteinFile, {
        ext: proteinFile.name.split('.').pop()
      });

      proteinComponent.addRepresentation('cartoon', {
        colorScheme: 'chainname',
        opacity: 0.8
      });

      const coords = {
        x: parseFloat(data.x),
        y: parseFloat(data.y),
        z: parseFloat(data.z)
      };
      const radius = parseFloat(data.radius);

      // Load ligand if provided (OPTIONAL)
      if (ligandFile) {
        const ligandComponent = await stage.loadFile(ligandFile, {
          ext: ligandFile.name.split('.').pop()
        });

        ligandComponent.addRepresentation('ball+stick', {
          colorScheme: 'element'
        });

        // Calculate ligand center
        const center = calculateLigandCenter(ligandComponent);
        setLigandCenter(center);

        if (center) {
          // Calculate distance
          const dist = calculateDistance(center, coords);
          setDistance(dist);

          // Check if match (ligand center is within the box)
          const match = dist <= radius / 2;
          setIsMatch(match);
        }

        message.success('Protein and ligand loaded successfully!');
      } else {
        message.success('Protein loaded successfully! (Ligand not provided)');
      }

      // Draw binding box
      drawBindingBox(coords.x, coords.y, coords.z, radius);

      // Auto-center view
      stage.autoView(1000);

    } catch (err) {
      console.error('Error loading structures:', err);
      setError('Failed to load structures: ' + err.message);
      message.error('Failed to load structures');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (stageRef.current) {
      stageRef.current.removeAllComponents();
    }
    setProteinFile(null);
    setLigandFile(null);
    setLigandCenter(null);
    setDistance(null);
    setIsMatch(null);
    setBoxShapeRef(null);
  };

  return (
    <div className="min-h-full p-4 md:p-6 space-y-6 molecular-bg">
      {/* Header Section */}
      <div className="bg-background-light-primary dark:bg-background-dark-secondary rounded-2xl shadow-soft border border-border-light-default dark:border-border-dark-subtle p-6 backdrop-blur-sm">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-glow-purple">
            <Box className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">
              Binding Box Comparator
            </h1>
            <p className="text-text-light-secondary dark:text-text-dark-secondary">
              Visualize predicted binding sites on protein structure. Optionally upload ligand to compare positions.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Panel - Upload & Controls */}
        <div className="xl:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Upload Structures
              </CardTitle>
              <CardDescription>
                Upload protein structure (required) and ligand (optional for comparison)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Protein Upload */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Protein Structure</label>
                  <div
                    className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary-500 transition-colors"
                    onClick={() => document.getElementById('protein-upload').click()}
                  >
                    <input
                      id="protein-upload"
                      type="file"
                      accept=".pdb,.pdbqt"
                      onChange={handleProteinUpload}
                      className="hidden"
                      disabled={loading}
                    />
                    <Inbox className="w-8 h-8 text-primary-500 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {proteinFile ? proteinFile.name : 'Click to upload PDB/PDBQT'}
                    </p>
                  </div>
                </div>

                {/* Ligand Upload */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Ligand Structure <span className="text-xs text-muted-foreground">(Optional)</span>
                  </label>
                  <div
                    className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary-500 transition-colors"
                    onClick={() => document.getElementById('ligand-upload').click()}
                  >
                    <input
                      id="ligand-upload"
                      type="file"
                      accept=".sdf,.pdb,.mol2"
                      onChange={handleLigandUpload}
                      className="hidden"
                      disabled={loading}
                    />
                    <Inbox className="w-8 h-8 text-primary-500 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {ligandFile ? ligandFile.name : 'Click to upload SDF/PDB/MOL2 (Optional)'}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Upload ligand only if you want to compare with predicted binding site
                  </p>
                </div>

                {/* Coordinates */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Binding Site Center (Å)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="X"
                        {...register('x', { required: true })}
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Y"
                        {...register('y', { required: true })}
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Z"
                        {...register('z', { required: true })}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </div>

                {/* Radius */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Box Radius (Å)</label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Enter radius"
                    {...register('radius', { required: true, min: 1 })}
                    disabled={loading}
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    disabled={loading}
                    className="flex-1"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reset
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || !proteinFile}
                    className="flex-1"
                  >
                    <Box className="w-4 h-4 mr-2" />
                    {ligandFile ? 'Compare & Show Box' : 'Show Binding Box'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Results Panel */}
          {distance !== null && ligandCenter && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Analysis Results
                  {isMatch !== null && (
                    <Badge variant={isMatch ? "success" : "destructive"}>
                      {isMatch ? '✅ Match' : '❌ Mismatch'}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted rounded-lg p-4 space-y-3">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Ligand Center
                    </div>
                    <div className="text-sm font-mono">
                      X: {ligandCenter.x.toFixed(2)} Å<br />
                      Y: {ligandCenter.y.toFixed(2)} Å<br />
                      Z: {ligandCenter.z.toFixed(2)} Å
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Distance from Predicted Site
                    </div>
                    <div className="text-2xl font-bold text-primary">
                      {distance.toFixed(2)} Å
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Box Radius
                    </div>
                    <div className="text-sm font-mono">
                      {watchedValues.radius} Å
                    </div>
                  </div>
                </div>

                {!isMatch && (
                  <Alert variant="warning">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Mismatch Detected</AlertTitle>
                    <AlertDescription>
                      The ligand center is outside the predicted binding box.
                      Consider adjusting the coordinates or radius.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel - 3D Viewer */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>3D Molecular Viewer</CardTitle>
              <CardDescription>
                Interactive visualization of protein structure with predicted binding box
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div
                ref={containerRef}
                style={{
                  width: '100%',
                  height: '600px',
                  border: '1px solid #d9d9d9',
                  borderRadius: 8,
                  backgroundColor: 'white',
                  position: 'relative'
                }}
              >
                {!viewerReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                      <p className="text-sm text-muted-foreground">Loading 3D viewer...</p>
                    </div>
                  </div>
                )}

                {viewerReady && !proteinFile && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <Box className="w-16 h-16 mx-auto mb-4 opacity-20" />
                      <p>Upload protein structure and enter coordinates</p>
                      <p className="text-sm mt-2">Optionally add ligand for comparison</p>
                    </div>
                  </div>
                )}
              </div>

              {viewerReady && (
                <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                  <strong>Controls:</strong> Left-click: rotate | Right-click: pan | Scroll: zoom
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BindingBoxComparator;
