import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Beaker,
  Clock,
  CheckCircle2,
  Plus,
  ArrowRight
} from 'lucide-react';
import { Button } from '../components/UI/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/UI/Card';
import { Skeleton } from '../components/UI/skeleton';
import { Badge } from '../components/UI/Badge';
import apiService from '../services/apiService';
import { cn } from '../utils/cn';

const Overview = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState({
    totalProjects: 0,
    activeJobs: 0,
    completedJobs: 0,
    successRate: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverviewData();
  }, []);

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const [projectsData, statsData] = await Promise.allSettled([
        apiService.getProjects(),
        apiService.getProjectStats()
      ]);

      if (projectsData.status === 'fulfilled') {
        setProjects(projectsData.value || []);
      }

      if (statsData.status === 'fulfilled') {
        setStats(statsData.value);
      }
    } catch (error) {
      console.error('Failed to fetch overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectClick = (projectId) => {
    navigate(`/projects/${projectId}`);
  };

  const handleCreateProject = () => {
    navigate('/projects');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="text-6xl mb-6 animate-pulse">🧬</div>
          <Skeleton className="h-4 w-[250px] mx-auto" />
          <Skeleton className="h-4 w-[200px] mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="space-y-0">
        {/* Hero Section */}
        <section className="py-16 bg-gradient-to-br from-background to-accent/20 relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 opacity-5">
            <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
              <pattern id="overview-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M10 0 C15 5 15 15 10 20 M10 0 C5 5 5 15 10 20" stroke="currentColor" strokeWidth="0.5" fill="none" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#overview-pattern)" />
            </svg>
          </div>

          <div className="max-w-7xl mx-auto px-6 lg:px-8 relative">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
                  Projects Overview
                </h1>
                <p className="text-xl text-muted-foreground max-w-3xl">
                  Manage your molecular design projects and track job progress
                </p>
              </div>
              <Button onClick={handleCreateProject} size="lg" className="gap-2">
                <Plus className="w-4 h-4" />
                <span>New Project</span>
              </Button>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-12 bg-muted/30 border-b border-border">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Projects
                  </CardTitle>
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalProjects}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Active Jobs
                  </CardTitle>
                  <Beaker className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.activeJobs}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Completed Jobs
                  </CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.completedJobs}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Success Rate
                  </CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.successRate}%</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Projects Grid */}
        <section className="py-12 bg-background">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            {projects.length === 0 ? (
              <Card className="p-16 text-center">
                <div className="max-w-md mx-auto space-y-6">
                  <div className="text-6xl">📁</div>
                  <div>
                    <h3 className="text-2xl font-bold text-foreground mb-4">No Projects Yet</h3>
                    <p className="text-muted-foreground mb-8">
                      Create your first project to start molecular docking and analysis
                    </p>
                  </div>
                  <Button onClick={handleCreateProject} size="lg" className="gap-2">
                    <Plus className="w-4 h-4" />
                    <span>Create Your First Project</span>
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <Card
                    key={project.id}
                    onClick={() => handleProjectClick(project.id)}
                    className="cursor-pointer transition-all hover:border-primary hover:shadow-lg group"
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-primary text-primary-foreground rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                          <FolderKanban className="w-6 h-6" />
                        </div>
                        <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                          {project.status || 'active'}
                        </Badge>
                      </div>
                      <CardTitle className="group-hover:text-primary transition-colors">
                        {project.name}
                      </CardTitle>
                      <CardDescription className="line-clamp-2">
                        {project.description || 'No description provided'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-muted-foreground font-medium mb-1">Jobs</div>
                          <div className="text-lg font-bold">{project.job_count || 0}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground font-medium mb-1">Created</div>
                          <div className="text-lg font-bold">
                            {project.created_at ? new Date(project.created_at).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <span className="text-sm font-medium text-muted-foreground">View Details</span>
                        <ArrowRight className="w-4 h-4 text-primary group-hover:translate-x-1 transition-transform" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Overview;
