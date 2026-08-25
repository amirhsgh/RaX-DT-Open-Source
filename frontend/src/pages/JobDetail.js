import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';
import {
  ArrowLeft,
  PlayCircle,
  PauseCircle,
  StopCircle,
  Eye,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../utils/cn';

// shadcn/ui imports
import { Button } from '../components/UI/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/UI/Card';
import { Badge } from '../components/UI/Badge';
import { Alert, AlertDescription } from '../components/UI/Alert';
import { Progress } from '../components/UI/progress';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/UI/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/UI/dialog';

const JobDetail = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const [showStopDialog, setShowStopDialog] = useState(false);

  useEffect(() => {
    fetchJobData(true); // Initial load with loading state

    // Set up polling for job status updates only for running jobs
    const interval = setInterval(() => fetchJobData(false), 3000); // More frequent updates
    return () => clearInterval(interval);
  }, [jobId]);

  const fetchJobData = async (showLoading = false) => {
    try {
      if (showLoading) {
        setLoading(true);
      } else {
        setIsPolling(true);
      }

      // Fetch job data first
      const jobResponse = await apiService.getJob(jobId);
      const jobData = jobResponse;

      // Then fetch logs and task status in parallel
      const [logsResponse, taskStatusResponse] = await Promise.allSettled([
        apiService.getJobLogs(jobId).catch(() => ({ logs: [] })), // Fallback if logs API doesn't exist
        apiService.getTaskStatus(jobId).catch(() => null) // Get task status by job ID
      ]);

      // Get Celery task status if available
      let taskStatus = null;
      if (taskStatusResponse.status === 'fulfilled' && taskStatusResponse.value) {
        const taskResponse = taskStatusResponse.value;
        taskStatus = taskResponse.task_status; // Backend returns {job_id, celery_task_id, task_status}
      }

      // Try to get project data, but handle failure gracefully
      let projectName = 'Unknown Project';
      try {
        const projectResponse = await apiService.getProject(jobData.project_id);
        projectName = projectResponse?.name || 'Unknown Project';
      } catch (error) {
        console.warn('Failed to fetch project data:', error);
      }

      // Use Celery task status for better progress reporting
      let currentProgress = jobData.progress_percentage || 0;
      let currentStatus = jobData.status || 'unknown';
      let taskProgressInfo = null;

      if (taskStatus && taskStatus.status === 'PROGRESS' && taskStatus.info) {
        currentProgress = taskStatus.info.percentage || currentProgress;
        taskProgressInfo = taskStatus.info;
        if (jobData.status === 'running') {
          currentStatus = 'running';
        }
      } else if (taskStatus && taskStatus.status === 'FAILURE') {
        currentStatus = 'failed';
      }

      // Map backend data to frontend format
      const mappedJob = {
        id: jobData.id,
        name: jobData.name || 'Unnamed Job',
        projectId: jobData.project_id,
        projectName: projectName,
        status: currentStatus,
        progress: currentProgress,
        currentStep: getCurrentStepFromStage(jobData.current_stage || 'pending'),
        startTime: jobData.created_at ? new Date(jobData.created_at).toLocaleString() : 'N/A',
        estimatedEndTime: jobData.estimated_completion ? new Date(jobData.estimated_completion).toLocaleString() : null,
        elapsedTime: calculateElapsedTime(jobData.created_at),
        remainingTime: calculateRemainingTime(jobData.created_at, jobData.estimated_completion),
        totalMolecules: jobData.total_ligands || 0,
        processedMolecules: taskProgressInfo?.current || jobData.processed_ligands || 0,
        currentMolecule: taskProgressInfo?.status || jobData.current_molecule || null,
        bestScore: jobData.best_affinity || null,
        averageScore: jobData.average_affinity || null,
        error_message: jobData.error_message || (taskStatus?.info?.error) || null,
        parameters: {
          exhaustiveness: jobData.exhaustiveness || 8,
          num_poses: jobData.num_modes || 9,
          energy_range: 3.0,
          cpu: 4
        },
        steps: getStepsFromStage(jobData.current_stage || 'pending', currentStatus),
        taskStatus: taskStatus // Include raw task status for debugging
      };

      setJob(mappedJob);

      // Handle logs with Celery task logs
      let combinedLogs = [];

      if (logsResponse.status === 'fulfilled') {
        combinedLogs = logsResponse.value.logs || [];
      }

      // Add Celery task logs if available
      if (taskStatus && taskStatus.info) {
        if (taskStatus.info.status) {
          combinedLogs.push({
            time: new Date().toLocaleTimeString(),
            level: 'INFO',
            message: `Celery Task: ${taskStatus.info.status}`
          });
        }
      }

      // Add error log if job failed
      if (mappedJob.status === 'failed' && mappedJob.error_message) {
        combinedLogs.push({
          time: new Date().toLocaleTimeString(),
          level: 'ERROR',
          message: `Job Failed: ${mappedJob.error_message}`
        });
      }

      // Add detailed task status logs for monitoring
      if (taskStatus) {
        combinedLogs.push({
          time: new Date().toLocaleTimeString(),
          level: 'DEBUG',
          message: `Celery Status: ${taskStatus.status} | Progress: ${currentProgress}%`
        });

        // Add task result information if available
        if (taskStatus.result && typeof taskStatus.result === 'object') {
          Object.entries(taskStatus.result).forEach(([key, value]) => {
            combinedLogs.push({
              time: new Date().toLocaleTimeString(),
              level: 'DEBUG',
              message: `Task ${key}: ${JSON.stringify(value)}`
            });
          });
        }
      }

      // If no logs at all, add default
      if (combinedLogs.length === 0) {
        combinedLogs = [
          { time: new Date().toLocaleTimeString(), level: 'INFO', message: 'Job monitoring active...' }
        ];
      }

      setLogs(combinedLogs);

    } catch (error) {
      console.error('Failed to fetch job data:', error);
      if (showLoading) {
        setJob(null);
        setLogs([]);
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      } else {
        setIsPolling(false);
      }
    }
  };

  // Helper functions for data mapping
  const getCurrentStepFromStage = (stage) => {
    const stageMapping = {
      'pending': 0,
      'ligand_prep_3d': 1,
      'protein_prep': 1,
      'ligand_prep_advanced': 2,
      'docking': 3,
      'results': 4
    };
    return stageMapping[stage] || 0;
  };

  const getStepsFromStage = (currentStage, status) => {
    const steps = [
      { name: 'Initialization', status: 'completed', duration: '' },
      { name: 'Preparation', status: 'completed', duration: '' },
      { name: 'Docking', status: 'pending', duration: '' },
      { name: 'Analysis', status: 'pending', duration: '' },
      { name: 'Results', status: 'pending', duration: '' }
    ];

    const currentStepIndex = getCurrentStepFromStage(currentStage);

    steps.forEach((step, index) => {
      if (index < currentStepIndex) {
        step.status = 'completed';
      } else if (index === currentStepIndex) {
        step.status = status === 'running' ? 'process' : (status === 'completed' ? 'finish' : 'error');
      } else {
        step.status = 'wait';
      }
    });

    return steps;
  };

  const calculateElapsedTime = (startTime) => {
    if (!startTime) return 'N/A';
    const start = new Date(startTime);
    const now = new Date();
    const diff = now - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const calculateRemainingTime = (startTime, estimatedEnd) => {
    if (!estimatedEnd) return 'N/A';
    const end = new Date(estimatedEnd);
    const now = new Date();
    const diff = end - now;
    if (diff <= 0) return '0m';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const handleJobAction = async (action) => {
    try {
      switch (action) {
        case 'pause':
          await apiService.pauseJob(jobId);
          toast.success('Job paused successfully');
          fetchJobData(); // Refresh job data
          break;
        case 'resume':
          await apiService.resumeJob(jobId);
          toast.success('Job resumed successfully');
          fetchJobData(); // Refresh job data
          break;
        case 'stop':
          setShowStopDialog(true);
          break;
        default:
          break;
      }
    } catch (error) {
      toast.error(`Failed to ${action} job: ${error.message}`);
    }
  };

  const confirmStopJob = async () => {
    try {
      await apiService.cancelJob(jobId);
      toast.success('Job stopped successfully');
      setShowStopDialog(false);
      fetchJobData(); // Refresh job data
    } catch (error) {
      toast.error(`Failed to stop job: ${error.message}`);
    }
  };

  const getCurrentStepStatus = (stepIndex) => {
    if (stepIndex < job?.currentStep) return 'finish';
    if (stepIndex === job?.currentStep) return 'process';
    return 'wait';
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

  if (loading) {
    return <div className="p-6 text-foreground">Loading...</div>;
  }

  if (!job) {
    return <div className="p-6 text-foreground">Job not found or failed to load.</div>;
  }

  const isRunning = job.status === 'running';
  const isPaused = job.status === 'paused';
  const isCompleted = job.status === 'completed';

  return (
    <div className="p-6 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => navigate(`/projects/${job.projectId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Project
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground m-0">{job.name}</h1>
            <p className="text-muted-foreground m-0">Project: {job.projectName}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {isRunning && (
            <>
              <Button
                variant="outline"
                onClick={() => handleJobAction('pause')}
              >
                <PauseCircle className="h-4 w-4 mr-2" />
                Pause
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleJobAction('stop')}
              >
                <StopCircle className="h-4 w-4 mr-2" />
                Stop
              </Button>
            </>
          )}

          {isPaused && (
            <Button
              variant="primary"
              onClick={() => handleJobAction('resume')}
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}

          {isCompleted && (
            <Button
              variant="primary"
              onClick={() => navigate(`/results/${job.id}`)}
            >
              <Eye className="h-4 w-4 mr-2" />
              View Results
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatisticCard
          title="Progress"
          value={job.progress}
          suffix="%"
          prefix={isRunning ? Loader2 : CheckCircle2}
          valueColor={isRunning ? 'var(--primary)' : 'var(--chart-2)'}
        />
        <StatisticCard
          title="Processed"
          value={`${job.processedMolecules} / ${job.totalMolecules}`}
        />
        <StatisticCard
          title="Best Score"
          value={job.bestScore}
          valueColor="var(--chart-1)"
        />
        <StatisticCard
          title="Remaining Time"
          value={job.remainingTime}
          prefix={Clock}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card className="bg-card border-border rounded-lg">
            <CardHeader>
              <CardTitle>Job Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <Progress
                  value={job.progress}
                  className="h-2"
                />
                <p className="text-sm text-muted-foreground mt-2">
                  {job.progress}% ({job.processedMolecules}/{job.totalMolecules})
                </p>
              </div>

              {isRunning && (
                <Alert className="mb-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AlertDescription>
                    Currently processing: {job.currentMolecule || 'Preparing...'}
                  </AlertDescription>
                </Alert>
              )}

              {job.status === 'failed' && job.error_message && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Job Failed:</strong> {job.error_message}
                  </AlertDescription>
                </Alert>
              )}

              {/* Custom Steps Component */}
              <div className="flex items-center justify-between">
                {(job.steps || []).map((step, index) => (
                  <React.Fragment key={index}>
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        step.status === 'completed' || step.status === 'finish' ? 'bg-primary text-primary-foreground' :
                        step.status === 'process' ? 'bg-primary/20 text-primary' :
                        step.status === 'error' ? 'bg-destructive text-destructive-foreground' :
                        'bg-muted text-muted-foreground'
                      )}>
                        {step.status === 'completed' || step.status === 'finish' ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : step.status === 'process' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : step.status === 'error' ? (
                          <AlertCircle className="h-5 w-5" />
                        ) : (
                          <span>{index + 1}</span>
                        )}
                      </div>
                      <span className="text-xs mt-2 text-center">{step.name}</span>
                    </div>
                    {index < (job.steps || []).length - 1 && (
                      <div className={cn(
                        "flex-1 h-0.5 mx-2",
                        step.status === 'completed' || step.status === 'finish' ? 'bg-primary' : 'bg-foreground'
                      )} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Job Logs</CardTitle>
                {isPolling && !loading && (
                  <Badge variant="secondary">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Live Updates
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Time</TableHead>
                      <TableHead className="w-[100px]">Level</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-xs">{log.time}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              log.level === 'ERROR' ? 'destructive' :
                              log.level === 'WARNING' ? 'secondary' :
                              log.level === 'SUCCESS' ? 'default' : 'outline'
                            }
                          >
                            {log.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{log.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="bg-card border-border rounded-lg">
            <CardHeader>
              <CardTitle>Job Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Status</dt>
                  <dd>
                    <Badge
                      variant={
                        isRunning ? 'default' :
                        isPaused ? 'secondary' :
                        isCompleted ? 'default' : 'outline'
                      }
                    >
                      {isRunning && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {isPaused && <PauseCircle className="h-3 w-3 mr-1" />}
                      {isCompleted && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {!isRunning && !isPaused && !isCompleted && <AlertCircle className="h-3 w-3 mr-1" />}
                      {job.status ? job.status.toUpperCase() : 'UNKNOWN'}
                    </Badge>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Started</dt>
                  <dd className="text-sm font-medium">{job.startTime}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Elapsed Time</dt>
                  <dd className="text-sm font-medium">{job.elapsedTime}</dd>
                </div>
                {job.estimatedEndTime && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Estimated End</dt>
                    <dd className="text-sm font-medium">{job.estimatedEndTime}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Total Molecules</dt>
                  <dd className="text-sm font-medium">{job.totalMolecules}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Average Score</dt>
                  <dd className="text-sm font-medium">{job.averageScore ? job.averageScore.toFixed(1) : 'N/A'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="bg-card border-border rounded-lg">
            <CardHeader>
              <CardTitle>Parameters</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Exhaustiveness</dt>
                  <dd className="text-sm font-medium">{job.parameters?.exhaustiveness || 'N/A'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Number of Poses</dt>
                  <dd className="text-sm font-medium">{job.parameters?.num_poses || 'N/A'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Energy Range</dt>
                  <dd className="text-sm font-medium">{job.parameters?.energy_range ? `${job.parameters.energy_range} kcal/mol` : 'N/A'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">CPU Cores</dt>
                  <dd className="text-sm font-medium">{job.parameters?.cpu || 'N/A'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stop Job Confirmation Dialog */}
      <Dialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop Job</DialogTitle>
            <DialogDescription>
              Are you sure you want to stop this job? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStopDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmStopJob}>
              Stop Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JobDetail;
