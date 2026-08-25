import { Download, FlaskConical, Inbox, Target, Search } from 'lucide-react';
import { message } from '../utils/toast';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { withAntdForm } from '../components/UI/form';

import { Progress } from '../components/UI/progress';

import { Input } from '../components/UI/Input';

import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../components/UI/Card';

import { Button } from '../components/UI/Button';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/UI/tabs';

import axios from 'axios';

// Configure axios for this component
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1',
  timeout: 300000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const ProteinPreparation = () => {
  // Form برای Known Binding Site
  const knownForm = useForm({
    defaultValues: {
      ligand_resn: 'KAA',
      output_name: 'prepared'
    }
  });
  withAntdForm(knownForm);

  // Form برای Predict Binding Site
  const predictForm = useForm({
    defaultValues: {
      output_name: 'predicted'
    }
  });
  withAntdForm(predictForm);

  // States برای Known Binding Site
  const [knownLoading, setKnownLoading] = useState(false);
  const [knownProgress, setKnownProgress] = useState(0);
  const [knownResultFiles, setKnownResultFiles] = useState(null);
  const [knownUploadedFile, setKnownUploadedFile] = useState(null);

  // States برای Predict Binding Site
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictProgress, setPredictProgress] = useState(0);
  const [predictResultFiles, setPredictResultFiles] = useState(null);
  const [predictUploadedFile, setPredictUploadedFile] = useState(null);
  const [predictedSites, setPredictedSites] = useState(null);

  // Handlers for Known Binding Site
  const handleKnownFileUpload = ({ file, fileList }) => {
    if (fileList.length > 0) {
      setKnownUploadedFile(file);
      message.success(`${file.name} selected successfully`);
    } else {
      setKnownUploadedFile(null);
    }
  };

  const handleKnownSubmit = async (values) => {
    if (!knownUploadedFile) {
      message.error('Please select a PDB or CIF file to upload');
      return;
    }

    setKnownLoading(true);
    setKnownProgress(0);
    setKnownResultFiles(null);

    try {
      const formData = new FormData();
      formData.append('protein_file', knownUploadedFile);
      formData.append('ligand_resn', values.ligand_resn || 'KAA');
      formData.append('output_name', values.output_name || 'prepared');

      const progressInterval = setInterval(() => {
        setKnownProgress(prev => prev < 90 ? prev + 10 : prev);
      }, 500);

      const response = await apiClient.post(
        '/protein-preparation/prepare',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          responseType: 'blob'
        }
      );

      clearInterval(progressInterval);
      setKnownProgress(100);

      const blob = new Blob([response.data], {
        type: 'application/zip'
      });

      const url = window.URL.createObjectURL(blob);
      const filename = `${values.output_name || 'prepared'}_prepared.zip`;

      setKnownResultFiles({
        url,
        filename,
        blob,
        size: blob.size
      });

      message.success('Protein preparation completed successfully!');
    } catch (error) {
      console.error('Error preparing protein:', error);
      message.error(
        error.response?.data?.detail ||
        'Failed to prepare protein. Please try again.'
      );
    } finally {
      setKnownLoading(false);
    }
  };

  const handleKnownDownload = () => {
    if (knownResultFiles) {
      try {
        const blob = new Blob([knownResultFiles.blob], {
          type: 'application/zip'
        });
        const downloadUrl = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = knownResultFiles.filename;
        link.setAttribute('download', knownResultFiles.filename);
        link.setAttribute('target', '_self');
        link.style.display = 'none';
        link.style.visibility = 'hidden';

        document.body.appendChild(link);

        setTimeout(() => {
          link.click();

          setTimeout(() => {
            if (document.body.contains(link)) {
              document.body.removeChild(link);
            }
            window.URL.revokeObjectURL(downloadUrl);
          }, 100);
        }, 10);

        message.success(`File ${knownResultFiles.filename} download started!`);
      } catch (error) {
        console.error('Download failed:', error);
        message.error('Download failed. Please try again.');
      }
    }
  };

  const resetKnownForm = () => {
    if (knownResultFiles && knownResultFiles.url) {
      window.URL.revokeObjectURL(knownResultFiles.url);
    }

    knownForm.reset();
    setKnownUploadedFile(null);
    setKnownResultFiles(null);
    setKnownProgress(0);
    setKnownLoading(false);
  };

  // Handlers for Predict Binding Site
  const handlePredictFileUpload = ({ file, fileList }) => {
    if (fileList.length > 0) {
      setPredictUploadedFile(file);
      message.success(`${file.name} selected successfully`);
    } else {
      setPredictUploadedFile(null);
    }
  };

  const handlePredictSubmit = async (values) => {
    if (!predictUploadedFile) {
      message.error('Please select a PDB or CIF file to upload');
      return;
    }

    setPredictLoading(true);
    setPredictProgress(0);
    setPredictResultFiles(null);
    setPredictedSites(null);

    try {
      const formData = new FormData();
      formData.append('protein_file', predictUploadedFile);
      formData.append('output_name', values.output_name || 'predicted');

      const progressInterval = setInterval(() => {
        setPredictProgress(prev => prev < 90 ? prev + 10 : prev);
      }, 500);

      const response = await apiClient.post(
        '/protein-preparation/predict-binding-sites',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          responseType: 'blob'
        }
      );

      clearInterval(progressInterval);
      setPredictProgress(100);

      const blob = new Blob([response.data], {
        type: 'application/zip'
      });

      const url = window.URL.createObjectURL(blob);
      const filename = `${values.output_name || 'predicted'}_p2rank_results.zip`;

      setPredictResultFiles({
        url,
        filename,
        blob,
        size: blob.size
      });

      message.success('Binding site prediction completed successfully!');

      // سعی در استخراج اطلاعات از ZIP برای نمایش
      try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(blob);
        const jsonFile = zip.file('predictions_summary.json');
        if (jsonFile) {
          const jsonContent = await jsonFile.async('string');
          const data = JSON.parse(jsonContent);
          setPredictedSites(data.predicted_sites || []);
        }
      } catch (zipError) {
        console.warn('Could not extract prediction summary:', zipError);
      }

    } catch (error) {
      console.error('Error predicting binding sites:', error);
      message.error(
        error.response?.data?.detail ||
        'Failed to predict binding sites. Please try again.'
      );
    } finally {
      setPredictLoading(false);
    }
  };

  const handlePredictDownload = () => {
    if (predictResultFiles) {
      try {
        const blob = new Blob([predictResultFiles.blob], {
          type: 'application/zip'
        });
        const downloadUrl = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = predictResultFiles.filename;
        link.setAttribute('download', predictResultFiles.filename);
        link.setAttribute('target', '_self');
        link.style.display = 'none';
        link.style.visibility = 'hidden';

        document.body.appendChild(link);

        setTimeout(() => {
          link.click();

          setTimeout(() => {
            if (document.body.contains(link)) {
              document.body.removeChild(link);
            }
            window.URL.revokeObjectURL(downloadUrl);
          }, 100);
        }, 10);

        message.success(`File ${predictResultFiles.filename} download started!`);
      } catch (error) {
        console.error('Download failed:', error);
        message.error('Download failed. Please try again.');
      }
    }
  };

  const resetPredictForm = () => {
    if (predictResultFiles && predictResultFiles.url) {
      window.URL.revokeObjectURL(predictResultFiles.url);
    }

    predictForm.reset();
    setPredictUploadedFile(null);
    setPredictResultFiles(null);
    setPredictProgress(0);
    setPredictLoading(false);
    setPredictedSites(null);
  };

  return (
    <div className="min-h-full p-4 md:p-6 space-y-6 molecular-bg">
      {/* Header Section */}
      <div className="bg-background-light-primary dark:bg-background-dark-secondary rounded-2xl shadow-soft border border-border-light-default dark:border-border-dark-subtle p-6 backdrop-blur-sm">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-glow-purple">
            <FlaskConical className="text-2xl text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">
              Protein Preparation
            </h1>
            <p className="text-text-light-secondary dark:text-text-dark-secondary">
              Prepare your protein structure for molecular docking with known binding sites or predict new binding sites using P2Rank.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="known" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="known" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Known Binding Site
          </TabsTrigger>
          <TabsTrigger value="predict" className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            Predict Binding Site
          </TabsTrigger>
        </TabsList>

        {/* Tab Content for Known Binding Site */}
        <TabsContent value="known" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="card-scientific">
                <div className="p-6 border-b border-border-light-default dark:border-border-dark-subtle">
                  <h3 className="text-lg font-semibold text-text-light-primary dark:text-text-dark-primary mb-1 flex items-center">
                    <div className="w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-white text-sm">⚗️</span>
                    </div>
                    Upload & Configure
                  </h3>
                  <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">
                    Upload your protein structure with known ligand binding site
                  </p>
                </div>
                <div className="p-6 bg-gradient-molecular">
                  <form onSubmit={knownForm.handleSubmit(handleKnownSubmit)} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-text-light-primary dark:text-text-dark-primary">
                        Protein Structure File
                      </label>
                      <div
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary-500 transition-colors"
                        onClick={() => document.getElementById('known-file-upload').click()}
                      >
                        <input
                          id="known-file-upload"
                          type="file"
                          accept=".pdb,.cif"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleKnownFileUpload({ file: e.target.files[0], fileList: [e.target.files[0]] });
                            }
                          }}
                          className="hidden"
                          disabled={knownLoading}
                        />
                        <Inbox className="text-4xl text-primary-500 mx-auto mb-4" />
                        <p className="text-text-light-primary dark:text-text-dark-primary text-lg font-medium mb-2">
                          Click or drag PDB or CIF file to this area to upload
                        </p>
                        <p className="text-text-light-secondary dark:text-text-dark-secondary">
                          Support for single PDB or CIF file upload only.
                          The file should contain both protein and ligand structures.
                        </p>
                        <div className="mt-4 flex justify-center space-x-2 text-xs text-text-secondary dark:text-secondary">
                          <span className="px-2 py-1 bg-neutral-100 dark:bg-foreground rounded">.pdb</span>
                          <span className="px-2 py-1 bg-neutral-100 dark:bg-foreground rounded">.cif</span>
                        </div>
                        {knownUploadedFile && (
                          <p className="mt-2 text-sm text-green-600">Selected: {knownUploadedFile.name}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-text-light-primary dark:text-text-dark-primary">
                          Ligand Residue Name
                        </label>
                        <Input
                          {...knownForm.register('ligand_resn')}
                          placeholder="Enter ligand residue name (e.g., KAA)"
                          disabled={knownLoading}
                          className="input-scientific"
                        />
                        <p className="text-xs text-muted-foreground">
                          The 3-letter residue name of the ligand to extract (e.g., KAA, ATP, NAD)
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-text-light-primary dark:text-text-dark-primary">
                          Output Name
                        </label>
                        <Input
                          {...knownForm.register('output_name')}
                          placeholder="Enter output file base name"
                          disabled={knownLoading}
                          className="input-scientific"
                        />
                        <p className="text-xs text-muted-foreground">Base name for output files</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 justify-end">
                      <Button type="button" onClick={resetKnownForm} disabled={knownLoading} className="btn-secondary">
                        Reset
                      </Button>
                      <Button
                        type="submit"
                        disabled={knownLoading || !knownUploadedFile}
                        className="btn-primary"
                      >
                        🧬 Prepare Protein
                      </Button>
                    </div>
                  </form>
                </div>

                {/* Progress Section */}
                {knownLoading && (
                  <div className="p-6 border-t border-border-light-default dark:border-border-dark-subtle bg-gradient-to-r from-primary-50/50 to-primary-100/50 dark:from-primary-900/10 dark:to-primary-800/10">
                    <div className="space-y-4">
                      <Progress
                        percent={knownProgress}
                        status="active"
                        strokeColor={{
                          '0%': '#a855f7',
                          '50%': '#9333ea',
                          '100%': '#7e22ce',
                        }}
                        className="mb-3"
                      />
                      <div className="text-center">
                        <div className="text-text-light-primary dark:text-text-dark-primary font-medium mb-2 flex items-center justify-center">
                          <span className="animate-spin mr-2">🧬</span>
                          Processing protein structure...
                        </div>
                        <div className="text-sm text-text-light-secondary dark:text-text-dark-secondary">
                          This may take a few minutes depending on structure complexity
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Results Section */}
                {knownResultFiles && (
                  <div className="p-6 border-t border-border-light-default dark:border-border-dark-subtle bg-gradient-to-r from-accent-green-50/50 to-accent-green-100/50 dark:from-accent-green-900/10 dark:to-accent-green-800/10">
                    <div className="bg-accent-green-100 dark:bg-accent-green-900/20 border border-accent-green-200 dark:border-accent-green-800 rounded-xl p-6">
                      <div className="flex items-center mb-4">
                        <div className="w-12 h-12 bg-accent-green-500 rounded-xl flex items-center justify-center mr-4">
                          <span className="text-white text-xl">✅</span>
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold text-accent-green-800 dark:text-accent-green-200 mb-1">
                            Preparation Complete!
                          </h4>
                          <p className="text-accent-green-600 dark:text-accent-green-300">
                            Your protein has been successfully prepared
                          </p>
                        </div>
                      </div>

                      <div className="mb-6">
                        <h5 className="font-medium text-text-light-primary dark:text-text-dark-primary mb-3">Results include:</h5>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="bg-background-light-primary dark:bg-background-dark-secondary p-3 rounded-lg border border-border-light-default dark:border-border-dark-subtle">
                            <div className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary">🧪 Clean PDB</div>
                            <div className="text-xs text-text-light-secondary dark:text-text-dark-secondary">Protein structure</div>
                          </div>
                          <div className="bg-background-light-primary dark:bg-background-dark-secondary p-3 rounded-lg border border-border-light-default dark:border-border-dark-subtle">
                            <div className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary">⚛️ Ligands SDF</div>
                            <div className="text-xs text-text-light-secondary dark:text-text-dark-secondary">Extracted ligands</div>
                          </div>
                          <div className="bg-background-light-primary dark:bg-background-dark-secondary p-3 rounded-lg border border-border-light-default dark:border-border-dark-subtle">
                            <div className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary">🔗 PDBQT</div>
                            <div className="text-xs text-text-light-secondary dark:text-text-dark-secondary">Docking ready</div>
                          </div>
                        </div>
                      </div>

                      <Button
                        type="primary"
                        icon={<Download />}
                        onClick={handleKnownDownload}
                        className="btn-primary w-full"
                      >
                        Download Results ({knownResultFiles.filename})
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Process Overview Card - Known Binding Site */}
            <div className="space-y-6">
              <div className="card-scientific">
                <div className="p-6 border-b border-border-light-default dark:border-border-dark-subtle">
                  <h3 className="text-lg font-semibold text-text-light-primary dark:text-text-dark-primary mb-1 flex items-center">
                    <div className="w-8 h-8 bg-gradient-to-r from-primary-600 to-primary-500 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-white text-sm">⚙️</span>
                    </div>
                    Process Overview
                  </h3>
                  <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">
                    Automated protein preparation workflow
                  </p>
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <h4 className="text-base font-semibold text-text-background dark:text-foreground mb-4">What this tool does:</h4>
                    <div className="space-y-3 text-text-secondary dark:text-secondary">
                      {[
                        { icon: '💧', text: 'Removes water molecules (HOH)', color: 'blue' },
                        { icon: '🧹', text: 'Removes non-protein atoms', color: 'green' },
                        { icon: '⚛️', text: 'Adds hydrogen atoms', color: 'purple' },
                        { icon: '🔗', text: 'Extracts specified ligand', color: 'orange' },
                        { icon: '📝', text: 'Converts protein to PDBQT format', color: 'cyan' }
                      ].map((step, index) => (
                        <div key={index} className="flex items-center p-3 bg-neutral-50 dark:bg-background-dark-tertiary rounded-xl">
                          <span className="text-xl mr-3">{step.icon}</span>
                          <span className="text-sm text-text-light-primary dark:text-text-dark-primary">{step.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-border-light-default dark:border-border-dark-subtle pt-6">
                    <h4 className="text-base font-semibold text-text-light-primary dark:text-text-dark-primary mb-4">Output Files:</h4>
                    <div className="space-y-3">
                      <div className="bg-primary-50 dark:bg-primary-900/20 p-3 rounded-lg border border-primary-200 dark:border-primary-800">
                        <code className="text-sm font-mono text-primary-700 dark:text-text-dark-white">*_protein_clean.pdb</code>
                        <div className="text-xs text-primary-600 dark:text-text-dark-white mt-1">Cleaned protein structure</div>
                      </div>
                      <div className="bg-secondary-50 dark:bg-secondary-900/20 p-3 rounded-lg border border-secondary-200 dark:border-secondary-800">
                        <code className="text-sm font-mono text-secondary-700 dark:text-text-dark-white">*_ligands.sdf</code>
                        <div className="text-xs text-secondary-600 dark:text-text-dark-white mt-1">Extracted ligands</div>
                      </div>
                      <div className="bg-accent-50 dark:bg-accent-900/20 p-3 rounded-lg border border-accent-200 dark:border-accent-800">
                        <code className="text-sm font-mono text-accent-700 dark:text-text-dark-white">*_protein.pdbqt</code>
                        <div className="text-xs text-accent-600 dark:text-text-dark-white mt-1">Protein ready for docking</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border-light-default dark:border-border-dark-subtle pt-6">
                    <div className="bg-gradient-to-r from-accent-blue-50 to-accent-blue-100 dark:from-accent-blue-900/20 dark:to-accent-blue-800/20 p-4 rounded-xl border border-accent-blue-200 dark:border-accent-blue-800">
                      <div className="flex items-start">
                        <div className="w-6 h-6 bg-accent-blue-500 rounded-full flex items-center justify-center mr-3 mt-0.5">
                          <span className="text-white text-xs">💡</span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-accent-blue-800 dark:text-accent-blue-200 mb-1">Ready for Docking</div>
                          <div className="text-xs text-accent-blue-600 dark:text-accent-blue-300">
                            The cleaned protein and extracted ligand files are ready for use in molecular docking workflows.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab Content for Predict Binding Site */}
        <TabsContent value="predict" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="card-scientific">
                <div className="p-6 border-b border-border-light-default dark:border-border-dark-subtle">
                  <h3 className="text-lg font-semibold text-text-light-primary dark:text-text-dark-primary mb-1 flex items-center">
                    <div className="w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-white text-sm">🔍</span>
                    </div>
                    Upload & Predict
                  </h3>
                  <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">
                    Upload your protein structure to predict binding sites using P2Rank
                  </p>
                </div>
                <div className="p-6 bg-gradient-molecular">
                  <form onSubmit={predictForm.handleSubmit(handlePredictSubmit)} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-text-light-primary dark:text-text-dark-primary">
                        Protein Structure File
                      </label>
                      <div
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary-500 transition-colors"
                        onClick={() => document.getElementById('predict-file-upload').click()}
                      >
                        <input
                          id="predict-file-upload"
                          type="file"
                          accept=".pdb,.cif"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handlePredictFileUpload({ file: e.target.files[0], fileList: [e.target.files[0]] });
                            }
                          }}
                          className="hidden"
                          disabled={predictLoading}
                        />
                        <Inbox className="text-4xl text-primary-500 mx-auto mb-4" />
                        <p className="text-text-light-primary dark:text-text-dark-primary text-lg font-medium mb-2">
                          Click or drag PDB or CIF file to this area to upload
                        </p>
                        <p className="text-text-light-secondary dark:text-text-dark-secondary">
                          Support for single PDB or CIF file upload only.
                          P2Rank will automatically predict binding sites.
                        </p>
                        <div className="mt-4 flex justify-center space-x-2 text-xs text-text-secondary dark:text-secondary">
                          <span className="px-2 py-1 bg-neutral-100 dark:bg-foreground rounded">.pdb</span>
                          <span className="px-2 py-1 bg-neutral-100 dark:bg-foreground rounded">.cif</span>
                        </div>
                        {predictUploadedFile && (
                          <p className="mt-2 text-sm text-green-600">Selected: {predictUploadedFile.name}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-text-light-primary dark:text-text-dark-primary">
                        Output Name
                      </label>
                      <Input
                        {...predictForm.register('output_name')}
                        placeholder="Enter output file base name"
                        disabled={predictLoading}
                        className="input-scientific"
                      />
                      <p className="text-xs text-muted-foreground">Base name for output files</p>
                    </div>

                    <div className="flex flex-wrap gap-3 justify-end">
                      <Button type="button" onClick={resetPredictForm} disabled={predictLoading} className="btn-secondary">
                        Reset
                      </Button>
                      <Button
                        type="submit"
                        disabled={predictLoading || !predictUploadedFile}
                        className="btn-primary"
                      >
                        🔍 Predict Binding Sites
                      </Button>
                    </div>
                  </form>
                </div>

                {/* Progress Section */}
                {predictLoading && (
                  <div className="p-6 border-t border-border-light-default dark:border-border-dark-subtle bg-gradient-to-r from-primary-50/50 to-primary-100/50 dark:from-primary-900/10 dark:to-primary-800/10">
                    <div className="space-y-4">
                      <Progress
                        percent={predictProgress}
                        status="active"
                        strokeColor={{
                          '0%': '#a855f7',
                          '50%': '#9333ea',
                          '100%': '#7e22ce',
                        }}
                        className="mb-3"
                      />
                      <div className="text-center">
                        <div className="text-text-light-primary dark:text-text-dark-primary font-medium mb-2 flex items-center justify-center">
                          <span className="animate-spin mr-2">🔍</span>
                          Predicting binding sites with P2Rank...
                        </div>
                        <div className="text-sm text-text-light-secondary dark:text-text-dark-secondary">
                          This may take a few minutes depending on protein size
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Results Section */}
                {predictResultFiles && (
                  <div className="p-6 border-t border-border-light-default dark:border-border-dark-subtle bg-gradient-to-r from-accent-green-50/50 to-accent-green-100/50 dark:from-accent-green-900/10 dark:to-accent-green-800/10">
                    <div className="bg-accent-green-100 dark:bg-accent-green-900/20 border border-accent-green-200 dark:border-accent-green-800 rounded-xl p-6">
                      <div className="flex items-center mb-4">
                        <div className="w-12 h-12 bg-accent-green-500 rounded-xl flex items-center justify-center mr-4">
                          <span className="text-white text-xl">✅</span>
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold text-accent-green-800 dark:text-accent-green-200 mb-1">
                            Prediction Complete!
                          </h4>
                          <p className="text-accent-green-600 dark:text-accent-green-300">
                            Binding sites have been successfully predicted
                          </p>
                        </div>
                      </div>

                      {predictedSites && predictedSites.length > 0 && (
                        <div className="mb-6">
                          <h5 className="font-medium text-text-light-primary dark:text-text-dark-primary mb-3">
                            Top Predicted Sites:
                          </h5>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {predictedSites.slice(0, 5).map((site, index) => (
                              <div key={index} className="bg-background-light-primary dark:bg-background-dark-secondary p-3 rounded-lg border border-border-light-default dark:border-border-dark-subtle">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <div className="text-sm font-medium text-text-light-primary dark:text-text-dark-primary">
                                      Site {site.name || index + 1}
                                    </div>
                                    <div className="text-xs text-text-light-secondary dark:text-text-dark-secondary">
                                      Rank: {site.rank || index + 1}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-bold text-primary-600 dark:text-primary-400">
                                      Score: {parseFloat(site.score || 0).toFixed(3)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <Button
                        type="primary"
                        icon={<Download />}
                        onClick={handlePredictDownload}
                        className="btn-primary w-full"
                      >
                        Download Results ({predictResultFiles.filename})
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Process Overview Card - Predict Binding Site */}
            <div className="space-y-6">
              <div className="card-scientific">
                <div className="p-6 border-b border-border-light-default dark:border-border-dark-subtle">
                  <h3 className="text-lg font-semibold text-text-light-primary dark:text-text-dark-primary mb-1 flex items-center">
                    <div className="w-8 h-8 bg-gradient-to-r from-primary-600 to-primary-500 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-white text-sm">🤖</span>
                    </div>
                    P2Rank Overview
                  </h3>
                  <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">
                    AI-powered binding site prediction
                  </p>
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <h4 className="text-base font-semibold text-text-background dark:text-foreground mb-4">What P2Rank does:</h4>
                    <div className="space-y-3 text-text-secondary dark:text-secondary">
                      {[
                        { icon: '🧠', text: 'ML-based pocket prediction' },
                        { icon: '📊', text: 'Ranks sites by probability' },
                        { icon: '🎯', text: 'No ligand required' },
                        { icon: '⚡', text: 'Fast and accurate' },
                        { icon: '📁', text: 'Multiple output formats' }
                      ].map((step, index) => (
                        <div key={index} className="flex items-center p-3 bg-neutral-50 dark:bg-background-dark-tertiary rounded-xl">
                          <span className="text-xl mr-3">{step.icon}</span>
                          <span className="text-sm text-text-light-primary dark:text-text-dark-primary">{step.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-border-light-default dark:border-border-dark-subtle pt-6">
                    <h4 className="text-base font-semibold text-text-light-primary dark:text-text-dark-primary mb-4">Output Files:</h4>
                    <div className="space-y-3">
                      <div className="bg-primary-50 dark:bg-primary-900/20 p-3 rounded-lg border border-primary-200 dark:border-primary-800">
                        <code className="text-sm font-mono text-primary-700 dark:text-text-dark-white">*_predictions.csv</code>
                        <div className="text-xs text-primary-600 dark:text-text-dark-white mt-1">Predicted sites with scores</div>
                      </div>
                      <div className="bg-secondary-50 dark:bg-secondary-900/20 p-3 rounded-lg border border-secondary-200 dark:border-secondary-800">
                        <code className="text-sm font-mono text-secondary-700 dark:text-text-dark-white">*_residues.csv</code>
                        <div className="text-xs text-secondary-600 dark:text-text-dark-white mt-1">Pocket residue details</div>
                      </div>
                      <div className="bg-accent-50 dark:bg-accent-900/20 p-3 rounded-lg border border-accent-200 dark:border-accent-800">
                        <code className="text-sm font-mono text-accent-700 dark:text-text-dark-white">*.pdb</code>
                        <div className="text-xs text-accent-600 dark:text-text-dark-white mt-1">Visualization files</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border-light-default dark:border-border-dark-subtle pt-6">
                    <div className="bg-gradient-to-r from-accent-blue-50 to-accent-blue-100 dark:from-accent-blue-900/20 dark:to-accent-blue-800/20 p-4 rounded-xl border border-accent-blue-200 dark:border-accent-blue-800">
                      <div className="flex items-start">
                        <div className="w-6 h-6 bg-accent-blue-500 rounded-full flex items-center justify-center mr-3 mt-0.5">
                          <span className="text-white text-xs">💡</span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-accent-blue-800 dark:text-accent-blue-200 mb-1">Use Cases</div>
                          <div className="text-xs text-accent-blue-600 dark:text-accent-blue-300">
                            Perfect for proteins without known ligands or when exploring alternative binding sites.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProteinPreparation;
