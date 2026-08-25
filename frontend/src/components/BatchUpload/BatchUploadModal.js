import React, { useState, useEffect, useCallback } from 'react';
import { FlaskConical, Info, Trash2, Upload as UploadIcon, FolderOpen } from 'lucide-react';
import { message } from '../../utils/toast';
import { useForm } from 'react-hook-form';
import { Tooltip } from '../UI/tooltip';
import { Progress } from '../UI/progress';
import { Alert, AlertDescription, AlertTitle } from '../UI/Alert';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, withAntdForm } from '../UI/form';
import { Input } from '../UI/Input';
import { Button } from '../UI/Button';
import { Modal } from '../UI/Modal';
import { Row, Col } from '../UI/grid';
import InputNumber from '../UI/input-number';
import Space from '../UI/space';
import List from '../UI/list';
import Divider from '../UI/divider';
import { Title, Text } from '../UI/typography';
import { Upload, UploadDragger } from '../UI/upload';
import apiService from '../../services/apiService';

const BatchUploadModal = ({ visible, onCancel, onSuccess, projectId }) => {
  const form = useForm({
    defaultValues: {
      jobNamePrefix: 'Batch Job',
      ligandsPerJob: 100
    }
  });
  withAntdForm(form);
  const [ligandFiles, setLigandFiles] = useState([]);
  const [proteinFile, setProteinFile] = useState(null);
  const [refLigandFile, setRefLigandFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [jobsCreated, setJobsCreated] = useState([]);

  const resetState = useCallback(() => {
    form.resetFields();
    setLigandFiles([]);
    setProteinFile(null);
    setRefLigandFile(null);
    setUploading(false);
    setUploadProgress(0);
    setJobsCreated([]);
  }, [form]);

  useEffect(() => {
    if (!visible) {
      resetState();
    }
  }, [visible, resetState]);

  const handleSubmit = async () => {
    try {
      await form.validateFields();

      if (ligandFiles.length === 0) {
        message.error('Please upload at least one ligand file');
        return;
      }

      if (!proteinFile) {
        message.error('Please upload a protein file');
        return;
      }

      setUploading(true);
      setUploadProgress(0);

      const values = form.getFieldsValue();

      const result = await apiService.batchUploadAndCreateJobs(
        projectId,
        ligandFiles,
        proteinFile,
        refLigandFile,
        values.jobNamePrefix || 'Batch Job',
        values.ligandsPerJob || 100
      );

      setJobsCreated(result.jobs_created);
      setUploadProgress(100);

      message.success(
        `Successfully created ${result.total_jobs} jobs with ${result.total_ligands} total ligands!`
      );

      // Close modal after a short delay to show success
      setTimeout(() => {
        onSuccess?.(result);
        resetState();
        onCancel?.();
      }, 2000);

    } catch (error) {
      console.error('Batch upload failed:', error);
      message.error(`Batch upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    resetState();
    onCancel?.();
  };

  const handleLigandUpload = (file) => {
    // Check file type
    const validExtensions = ['sdf', 'mol', 'mol2', 'smi', 'smiles'];
    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
      message.error(`Invalid file type. Supported formats: ${validExtensions.join(', ')}`);
      return false;
    }

    // Check for duplicates
    const isDuplicate = ligandFiles.some(existing =>
      existing.name === file.name && existing.size === file.size
    );

    if (isDuplicate) {
      message.warning('This file has already been added');
      return false;
    }

    setLigandFiles(prev => [...prev, file]);
    return false; // Prevent automatic upload
  };

  const handleProteinUpload = (file) => {
    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (fileExtension === 'pdb') {
      message.error('PDB files are not accepted. Please prepare your protein first using protein preparation tools to convert it to PDBQT format.');
      return false;
    }

    if (fileExtension !== 'pdbqt') {
      message.error('Only PDBQT format is supported for protein files. Please prepare your protein file first.');
      return false;
    }

    setProteinFile(file);
    return false;
  };

  const handleRefLigandUpload = (file) => {
    const validExtensions = ['sdf', 'mol', 'mol2', 'pdb', 'pdbqt'];
    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
      message.error(`Invalid reference ligand file type. Supported formats: ${validExtensions.join(', ')}`);
      return false;
    }

    setRefLigandFile(file);
    return false;
  };

  const removeLigandFile = (fileToRemove) => {
    setLigandFiles(prev => prev.filter(file => file !== fileToRemove));
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const estimateJobs = () => {
    const ligandsPerJob = form.getFieldValue('ligandsPerJob') || 100;
    // Rough estimate - each SDF file typically has multiple molecules
    const estimatedLigands = ligandFiles.length * 10; // Estimate 10 ligands per file
    return Math.ceil(estimatedLigands / ligandsPerJob);
  };

  return (
    <Modal
      title="Batch Upload and Job Creation"
      open={visible}
      onCancel={handleCancel}
      onOk={handleSubmit}
      width="90%"
      size='xl'
      okText={uploading ? "Uploading..." : "Create Jobs"}
      confirmLoading={uploading}
      closeOnBackdropClick={!uploading}
      contentClassName="p-0"
    >
      <Form form={form} layout="vertical" className="space-y-6 p-4 sm:p-6">
        <Alert variant="info" className="w-full mb-4">
          <AlertTitle>Batch Upload with Smart Naming</AlertTitle>
          <AlertDescription>
            Upload multiple ligand files and automatically create jobs. The system will:
            1) Use filenames when the Name property is missing,
            2) Auto-detect and convert 2D ligands to 3D,
            3) Split uploads into optimally sized jobs (100 ligands each).
          </AlertDescription>
        </Alert>

        <Row gutter={24}>
          <Col span={24} className="pr-3">
            <Form.Item
              label="Job Name Prefix"
              name="jobNamePrefix"
              initialValue="Batch Job"
              rules={[{ required: true, message: 'Please enter job name prefix' }]}
            >
              <Input placeholder="e.g., Virtual Screening" />
            </Form.Item>
          </Col>
          <Col span={24} className="pl-3">
            <Form.Item
              label={
                <Space>
                  Ligands per Job
                  <Tooltip title="Number of ligands to include in each job. Recommended: 100">
                    <Info />
                  </Tooltip>
                </Space>
              }
              name="ligandsPerJob"
              initialValue={100}
              rules={[{ required: true, type: 'number', min: 1, max: 1000 }]}
            >
              <InputNumber min={1} max={1000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Divider />

        {/* Ligand Files Upload */}
        <Title level={5}>
          <FlaskConical /> Ligand Files (SDF, MOL, MOL2, SMI)
        </Title>
        <UploadDragger
          className="w-full"
          multiple
          beforeUpload={handleLigandUpload}
          showUploadList={false}
          style={{ marginBottom: 16 }}
        >
          <p className="ant-upload-drag-icon">
            <FolderOpen className="w-12 h-12 mx-auto text-blue-500" />
          </p>
          <p className="ant-upload-text">Click or drag ligand files to this area to upload</p>
          <p className="ant-upload-hint">
            Support for multiple SDF, MOL, MOL2, or SMILES files.
            2D structures will be automatically converted to 3D.
          </p>
        </UploadDragger>

        {ligandFiles.length > 0 && (
          <List
            size="small"
            header={<div><strong>Ligand Files ({ligandFiles.length})</strong></div>}
            bordered
            dataSource={ligandFiles}
            style={{ marginBottom: 16 }}
            renderItem={(file) => (
              <List.Item
                actions={[
                  <Button
                    key={`remove-${file.name}`}
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(event) => {
                      event.preventDefault();
                      removeLigandFile(file);
                    }}
                    aria-label={`Remove ${file.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                ]}
              >
                <Space>
                  <Text>{file.name}</Text>
                  <Text type="secondary">({formatFileSize(file.size)})</Text>
                </Space>
              </List.Item>
            )}
          />
        )}

        <Row gutter={24}>
          <Col span={24} className="pr-3">
            {/* Protein File Upload */}
            <Title level={5}>Protein Structure (Required)</Title>
            <Upload
              beforeUpload={handleProteinUpload}
              accept=".pdbqt"
              showUploadList={false}
              className="w-full"
              style={{ marginBottom: 16 }}
            >
              <Button type="button" variant="secondary" className="w-full justify-center gap-2">
                <UploadIcon className="h-4 w-4" />
                Select Protein File (PDBQT Only)
              </Button>
            </Upload>
            {proteinFile && (
              <Alert variant="success" className="w-full mb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <AlertTitle className="text-sm font-semibold">Protein file ready</AlertTitle>
                    <AlertDescription className="text-sm text-foreground/80">
                      {proteinFile.name} • {formatFileSize(proteinFile.size)}
                    </AlertDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setProteinFile(null)}
                  >
                    Remove
                  </Button>
                </div>
              </Alert>
            )}
          </Col>

          <Col span={24} className="pl-3">
            {/* Reference Ligand Upload */}
            <Title level={5}>
              <Space>
                Reference Ligand (Optional)
                <Tooltip title="Used for GNINA autobox_ligand binding site detection">
                  <Info />
                </Tooltip>
              </Space>
            </Title>
            <Upload
              beforeUpload={handleRefLigandUpload}
              showUploadList={false}
              className="w-full"
              style={{ marginBottom: 16 }}
            >
              <Button type="button" variant="secondary" className="w-full justify-center gap-2">
                <UploadIcon className="h-4 w-4" />
                Select Reference Ligand
              </Button>
            </Upload>
            {refLigandFile && (
              <Alert variant="success" className="w-full mb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <AlertTitle className="text-sm font-semibold">Reference ligand ready</AlertTitle>
                    <AlertDescription className="text-sm text-foreground/80">
                      {refLigandFile.name} • {formatFileSize(refLigandFile.size)}
                    </AlertDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setRefLigandFile(null)}
                  >
                    Remove
                  </Button>
                </div>
              </Alert>
            )}
          </Col>
        </Row>

        {ligandFiles.length > 0 && (
          <>
            <Divider />
            <Alert
              message={`Estimated Jobs: ${estimateJobs()}`}
              description={`Based on ${ligandFiles.length} files and ${form.getFieldValue('ligandsPerJob') || 100} ligands per job`}
              type="info"
              style={{ marginBottom: 16 }}
            />
          </>
        )}

        {uploading && (
          <>
            <Divider />
            <Progress percent={uploadProgress} status="active" />
            <Text>Processing files and creating jobs...</Text>
          </>
        )}

        {jobsCreated.length > 0 && (
          <>
            <Divider />
            <Title level={5}>Jobs Created Successfully:</Title>
            <List
              size="small"
              dataSource={jobsCreated}
              renderItem={(job) => (
                <List.Item>
                  <Space>
                    <FlaskConical />
                    <Text strong>{job.name}</Text>
                    <Text type="secondary">({job.ligand_count} ligands)</Text>
                    <Text type="success">{job.status}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </>
        )}
      </Form>
    </Modal>
  );
};

export default BatchUploadModal;
