import { ArrowLeft, CheckCircle, Clock, Download, Eye, FileText, FlaskConical, Pill, PlayCircle, Plus, Zap } from 'lucide-react';
import { message } from '../utils/toast';
import React, { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../components/UI/avatar';
import { useForm } from 'react-hook-form';
import { Upload } from '../components/UI/upload';
import { Progress } from '../components/UI/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/UI/tabs';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, withAntdForm } from '../components/UI/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/UI/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/UI/select';
import { Input } from '../components/UI/Input';
import { Textarea } from '../components/UI/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Tag } from '../components/UI/Badge';
import Space from '../components/UI/space';
import { Modal } from '../components/UI/Modal';
import Descriptions from '../components/UI/descriptions';
import List from '../components/UI/list';
import InputNumber from '../components/UI/input-number';

import { useParams, useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';
import BatchUploadModal from '../components/BatchUpload/BatchUploadModal';

const ProjectDetail = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jobModalVisible, setJobModalVisible] = useState(false);
  const [batchUploadVisible, setBatchUploadVisible] = useState(false);

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      exhaustiveness: 8,
      num_poses: 9,
      center_x: 15.2,
      center_y: 18.7,
      center_z: 12.3,
      size_x: 20.0,
      size_y: 20.0,
      size_z: 20.0
    }
  });
  withAntdForm(form);

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  const fetchProjectData = async () => {
    setLoading(true);
    
    try {
      // Fetch project and jobs data in parallel
      const [projectData, jobsResponse] = await Promise.allSettled([
        apiService.getProject(projectId),
        apiService.getJobs(0, 100, projectId) // Get all jobs for this project
      ]);

      // Handle project data
      if (projectData.status === 'fulfilled') {
        setProject({
          ...projectData.value,
          status: 'active' // Default status since backend doesn't return project status
        });
      } else {
        console.error('Failed to fetch project:', projectData.reason);
        setProject({
          id: projectId,
          name: 'Unknown Project',
          description: 'Could not load project data',
          created_at: new Date().toISOString(),
          status: 'unknown'
        });
      }

      // Handle jobs data
      if (jobsResponse.status === 'fulfilled') {
        const jobsData = jobsResponse.value;
        // Convert backend format to frontend format
        const formattedJobs = (jobsData.jobs || []).map(job => ({
          id: job.id,
          name: job.name,
          status: job.status,
          progress: Math.min(100, Math.max(0, job.progress_percentage || 0)), // Ensure progress is 0-100
          startTime: job.created_at ? new Date(job.created_at).toLocaleDateString() : 'N/A',
          endTime: job.completed_at ? new Date(job.completed_at).toLocaleDateString() : null,
          moleculesProcessed: job.processed_ligands || 0,
          totalMolecules: job.total_ligands || 0,
          bestScore: job.best_affinity || null,
          averageScore: job.average_affinity || null,
          successfulDockings: job.successful_dockings || 0,
          failedDockings: job.failed_dockings || 0,
          current_stage: job.current_stage || 'pending',
          errorMessage: job.error_message || null
        }));
        setJobs(formattedJobs);
      } else {
        console.error('Failed to fetch jobs:', jobsResponse.reason);
        setJobs([]);
      }

    } catch (error) {
      console.error('Failed to fetch project data:', error);
      message.error('Failed to load project data');
      setProject({
        id: projectId,
        name: 'Unknown Project',
        description: 'Could not load project data',
        created_at: new Date().toISOString(),
        status: 'unknown'
      });
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateJob = form.handleSubmit(async (values) => {
    try {
      // Prepare job data according to backend schema
      const jobData = {
        project_id: projectId,
        name: values.name,
        config: {
          description: values.description || ""
        },
        processing_params: {
          pH: 7.4,
          max_tautomers: 1,
          max_stereoisomers: 1,
          use_stable_tautomers: false
        },
        docking_params: {
          center_x: values.center_x || 15.2,
          center_y: values.center_y || 18.7,
          center_z: values.center_z || 12.3,
          size_x: values.size_x || 20.0,
          size_y: values.size_y || 20.0,
          size_z: values.size_z || 20.0,
          exhaustiveness: values.exhaustiveness || 8,
          num_modes: values.num_poses || 9
        }
      };

      const newJob = await apiService.createJob(jobData);

      // Convert backend response to frontend format
      const formattedJob = {
        id: newJob.id,
        name: newJob.name,
        status: newJob.status,
        progress: newJob.progress_percentage || 0,
        startTime: 'Queued',
        moleculesProcessed: newJob.processed_ligands || 0,
        totalMolecules: newJob.total_ligands || 0,
        current_stage: newJob.current_stage || 'pending'
      };

      setJobs([...jobs, formattedJob]);
      setJobModalVisible(false);
      form.reset();
      message.success('Job created successfully! Upload files to start processing.');

    } catch (error) {
      console.error('Job creation failed:', error);
      message.error(`Failed to create job: ${error.message}`);
    }
  });

  const handleStartJob = async (jobId) => {
    try {
      const result = await apiService.startJob(jobId);
      message.success(result.message);
      
      // Refresh job data to get updated status from server
      fetchProjectData();
      
    } catch (error) {
      console.error('Failed to start job:', error);
      message.error(`Failed to start job: ${error.message}`);
    }
  };

  const handleFileUpload = async (file, fileType, jobId) => {
    try {
      let result;
      if (fileType === 'protein') {
        result = await apiService.uploadProtein(jobId, file);
      } else if (fileType === 'ref_ligand') {
        result = await apiService.uploadRefLigand(jobId, file);
      } else {
        result = await apiService.uploadLigands(jobId, file);
      }

      if (result.success) {
        const fileTypeLabel = fileType === 'ref_ligand' ? 'reference ligand' : fileType;
        message.success(`${fileTypeLabel} file uploaded successfully (${result.molecule_count || 1} molecules)`);
        // Refresh job data to update UI
        fetchProjectData();
        return true;
      } else {
        message.error(`Upload failed: ${result.message}`);
        return false;
      }
    } catch (error) {
      console.error('File upload failed:', error);
      message.error(`File upload failed: ${error.message}`);
      return false;
    }
  };

  const handleViewResults = (jobId) => {
    navigate(`/results/${jobId}`);
  };

  const jobColumns = [
    {
      title: 'Job Name',
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <Space>
          <FlaskConical />
          <span style={{ fontWeight: 'bold' }}>{text}</span>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusConfig = {
          pending: { color: 'default', text: 'Pending', icon: <Clock /> },
          running: { color: 'processing', text: 'Running', icon: <PlayCircle /> },
          completed: { color: 'success', text: 'Completed', icon: <CheckCircle /> },
          failed: { color: 'error', text: 'Failed' }
        };
        const config = statusConfig[status];
        return (
          <Tag color={config?.color} icon={config?.icon}>
            {config?.text}
          </Tag>
        );
      }
    },
    {
      title: 'Progress',
      dataIndex: 'progress',
      key: 'progress',
      render: (progress, record) => {
        let status = 'normal';
        if (record.status === 'running') status = 'active';
        else if (record.status === 'completed') status = 'success';
        else if (record.status === 'failed') status = 'exception';
        
        return (
          <div>
            <Progress 
              percent={progress} 
              size="small" 
              status={status}
              format={(percent) => {
                if (record.status === 'failed') return 'Failed';
                if (record.status === 'completed') return '100%';
                return `${percent}%`;
              }}
            />
            {record.status === 'running' && record.current_stage && (
              <small style={{ color: '#1890ff' }}>
                Stage: {record.current_stage}
              </small>
            )}
            {record.status === 'failed' && record.errorMessage && (
              <small style={{ color: '#ff4d4f' }}>
                Error: {record.errorMessage}
              </small>
            )}
            {record.moleculesProcessed > 0 && record.totalMolecules > 0 && (
              <small style={{ display: 'block', marginTop: '4px' }}>
                {record.moleculesProcessed}/{record.totalMolecules} molecules
              </small>
            )}
          </div>
        );
      }
    },
    {
      title: 'Duration',
      dataIndex: 'duration',
      key: 'duration',
      render: (duration, record) => {
        if (duration) return duration;
        if (record?.estimatedDuration) return `Est: ${record.estimatedDuration}`;
        return 'N/A';
      }
    },
    {
      title: 'Molecules',
      dataIndex: 'moleculesProcessed',
      key: 'moleculesProcessed',
    },
    {
      title: 'Best Score',
      dataIndex: 'bestScore',
      key: 'bestScore',
      render: (score) => score ? score.toFixed(1) : 'N/A'
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {record.status === 'pending' && (
            <>
              <Upload
                accept=".pdbqt"
                beforeUpload={(file) => {
                  const fileExtension = file.name.split('.').pop().toLowerCase();
                  if (fileExtension === 'pdb') {
                    message.error('PDB files need preparation first. Please convert to PDBQT format.');
                    return false;
                  }
                  handleFileUpload(file, 'protein', record.id);
                  return false;
                }}
                showUploadList={false}
              >
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Upload className="h-3 w-3" />
                  Protein
                </Button>
              </Upload>
              <Upload
                accept=".sdf,.mol,.mol2"
                beforeUpload={(file) => {
                  handleFileUpload(file, 'ligands', record.id);
                  return false;
                }}
                showUploadList={false}
              >
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Pill className="h-3 w-3" />
                  Ligands
                </Button>
              </Upload>
              <Upload
                accept=".sdf,.mol,.mol2,.pdb,.pdbqt"
                beforeUpload={(file) => {
                  handleFileUpload(file, 'ref_ligand', record.id);
                  return false;
                }}
                showUploadList={false}
              >
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Upload className="h-3 w-3" />
                  Ref Ligand
                </Button>
              </Upload>
              <Button
                variant="primary"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => handleStartJob(record.id)}
              >
                <PlayCircle className="h-3 w-3" />
                Start
              </Button>
            </>
          )}
          {record.status === 'completed' && (
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-2"
              onClick={() => handleViewResults(record.id)}
            >
              <Eye className="h-3 w-3" />
              Results
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => navigate(`/jobs/${record.id}`)}
          >
            <FileText className="h-3 w-3" />
            Details
          </Button>
        </Space>
      ),
    },
  ];

  const files = [
    {
      name: 'Target Protein',
      filename: project?.proteinFile,
      size: '125 KB',
      type: 'PDB',
      uploadDate: '2024-01-15'
    },
    {
      name: 'Molecule Library',
      filename: project?.moleculeLibrary,
      size: '15.2 MB',
      type: 'SDF',
      uploadDate: '2024-01-15'
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center p-8 max-w-md">
          <div className="mb-8">
            <svg className="animate-spin h-12 w-12 mx-auto mb-6 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <h2 className="text-foreground text-xl font-bold mb-3">
            Loading Project
          </h2>
          <p className="text-muted-foreground">
            Preparing project details
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full space-y-8 p-6 sm:p-8 lg:p-12">
      <div className="bg-card border border-border rounded-lg shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-4">
            <Button
              onClick={() => navigate('/projects')}
              variant="ghost"
              size="lg"
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </Button>
            <div>
              <h1 className="text-foreground text-2xl sm:text-3xl font-bold">{project?.name}</h1>
              <p className="text-muted-foreground text-sm">Project Overview</p>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-lg shadow-sm p-6 text-center">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FlaskConical className="text-2xl text-foreground" />
          </div>
          <div className="text-3xl font-bold text-foreground mb-2">
            {jobs.length}
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            Total Jobs
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg shadow-sm p-6 text-center">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-2xl text-foreground" />
          </div>
          <div className="text-3xl font-bold text-foreground mb-2">
            {jobs.filter(job => job.status === 'completed').length}
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            Completed
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg shadow-sm p-6 text-center">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <PlayCircle className="text-2xl text-foreground" />
          </div>
          <div className="text-3xl font-bold text-foreground mb-2">
            {jobs.filter(job => job.status === 'running').length}
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            Running
          </div>
        </div>
      </div>

      <Tabs defaultValue="jobs" className="w-full">
      <TabsList className="grid w-full grid-cols-3 mb-6">
        <TabsTrigger value="jobs">Jobs</TabsTrigger>
        <TabsTrigger value="info">Project Info</TabsTrigger>
        <TabsTrigger value="files">Files</TabsTrigger>
      </TabsList>
        <TabsContent value="jobs">
          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
                <div>
                  <h3 className="text-foreground text-xl font-bold mb-2">
                    Jobs
                  </h3>
                  <p className="text-muted-foreground">
                    Manage and monitor your analysis jobs
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => setBatchUploadVisible(true)}
                    variant="outline"
                    size="lg"
                    className="flex items-center gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    Batch Upload
                  </Button>
                  <Button
                    onClick={() => setJobModalVisible(true)}
                    variant="outline"
                    size="lg"
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create Job (Manual)
                  </Button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table
                columns={jobColumns.map(col => ({
                  ...col,
                  title: <span className="font-bold text-foreground text-sm">{col.title}</span>
                }))}
                dataSource={jobs}
                rowKey="id"
                pagination={false}
                className="bg-transparent"
                size="large"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="info">
          <Card title="Project Information">
            <Descriptions bordered>
              <Descriptions.Item label="Name" span={2}>
                {project?.name}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color="processing">{project?.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Description" span={3}>
                {project?.description}
              </Descriptions.Item>
              <Descriptions.Item label="Target Protein" span={2}>
                {project?.targetProtein}
              </Descriptions.Item>
              <Descriptions.Item label="Created">
                {project?.createdAt}
              </Descriptions.Item>
              <Descriptions.Item label="Molecules Count" span={2}>
                {project?.moleculesCount?.toLocaleString()}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </TabsContent>

        <TabsContent value="files">
          <Card title="Project Files">
            <List
              itemLayout="horizontal"
              dataSource={files}
              renderItem={item => (
                <List.Item
                  actions={[
                    <Button
                      key="download"
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={<FileText />} />}
                    title={item.name}
                    description={
                      <Space>
                        <Tag>{item.type}</Tag>
                        <span>{item.filename}</span>
                        <span>{item.size}</span>
                        <span>Uploaded: {item.uploadDate}</span>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </TabsContent>
      </Tabs>

      <Modal
        title={
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <Plus className="text-primary-foreground text-lg" />
            </div>
            <span className="text-xl font-bold text-foreground">
              Create New Job
            </span>
          </div>
        }
        open={jobModalVisible}
        onOk={handleCreateJob}
        onCancel={() => setJobModalVisible(false)}
        width="90%"
        style={{ maxWidth: '700px' }}
        okText="Create Job"
        okButtonProps={{
          className: 'bg-primary text-primary-foreground hover:opacity-90',
          style: { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }
        }}
        cancelButtonProps={{
          className: 'bg-secondary text-secondary-foreground hover:opacity-90',
          style: { backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }
        }}
      >
        <div className="bg-muted rounded-xl p-6 border border-border">
          <Form form={form} layout="vertical" className="space-y-6">
            <Form.Item
              label={<span className="text-base font-semibold text-foreground">Job Name</span>}
              name="name"
              rules={[{ required: true, message: 'Please enter job name' }]}
            >
              <Input
                placeholder="Enter job name"
                className="h-12 rounded-lg border-border text-foreground bg-input"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label={<span className="text-base font-semibold text-foreground">Description</span>}
              name="description"
            >
              <Textarea
                rows={3}
                placeholder="Enter job description"
                className="rounded-lg border-border text-foreground bg-input"
              />
            </Form.Item>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Form.Item
                label={<span className="text-sm font-semibold text-foreground">Exhaustiveness</span>}
                name="exhaustiveness"
                initialValue={8}
              >
                <InputNumber
                  min={1}
                  max={32}
                  className="w-full h-10 rounded-lg border-border bg-input"
                />
              </Form.Item>
              <Form.Item
                label={<span className="text-sm font-semibold text-foreground">Number of Poses</span>}
                name="num_poses"
                initialValue={9}
              >
                <InputNumber
                  min={1}
                  max={20}
                  className="w-full h-10 rounded-lg border-border bg-input"
                />
              </Form.Item>
            </div>

            <div className="pt-6 border-t border-border">
              <h4 className="text-foreground text-lg font-bold mb-4">Binding Site Configuration</h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Form.Item
                  label={<span className="text-sm font-semibold text-foreground">Center X</span>}
                  name="center_x"
                  initialValue={15.2}
                >
                  <InputNumber
                    step={0.1}
                    className="w-full h-10 rounded-lg border-border bg-input"
                  />
                </Form.Item>
                <Form.Item
                  label={<span className="text-sm font-semibold text-foreground">Center Y</span>}
                  name="center_y"
                  initialValue={18.7}
                >
                  <InputNumber
                    step={0.1}
                    className="w-full h-10 rounded-lg border-border bg-input"
                  />
                </Form.Item>
                <Form.Item
                  label={<span className="text-sm font-semibold text-foreground">Center Z</span>}
                  name="center_z"
                  initialValue={12.3}
                >
                  <InputNumber
                    step={0.1}
                    className="w-full h-10 rounded-lg border-border bg-input"
                  />
                </Form.Item>
              </div>
            </div>
          </Form>
        </div>
      </Modal>

      {/* Batch Upload Modal */}
      <BatchUploadModal
        visible={batchUploadVisible}
        onCancel={() => setBatchUploadVisible(false)}
        onSuccess={(result) => {
          message.success(`Created ${result.total_jobs} jobs successfully!`);
          fetchProjectData(); // Refresh the project data
        }}
        projectId={projectId}
      />

    </div>
  );
};

export default ProjectDetail;
