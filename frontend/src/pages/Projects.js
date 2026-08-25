import { Edit, Eye, FlaskConical, FolderOpen, Inbox, Plus, Trash2 } from 'lucide-react';
import { message } from '../utils/toast';
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '../components/UI/Alert';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/UI/dialog';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI/table';

import { Textarea } from '../components/UI/textarea';

import { Input } from '../components/UI/Input';

import { Button } from '../components/UI/Button';

import { Upload } from '../components/UI/upload';

import { useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';

const Projects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const form = useForm({
    defaultValues: {
      status: 'active'
    }
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiService.getProjects();
      setProjects(data || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setError('Failed to load projects. Please try again.');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = () => {
    setEditingProject(null);
    form.reset({ status: 'active' });
    setModalVisible(true);
  };

  const handleEditProject = (project) => {
    setEditingProject(project);
    form.reset(project);
    setModalVisible(true);
  };

  const confirmDelete = (project) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    try {
      const response = await apiService.deleteProject(projectToDelete.id);
      setProjects(prevProjects => prevProjects.filter(p => p.id !== projectToDelete.id));
      const successMessage = response?.message || 'Project deleted successfully';
      message.success(successMessage);
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    } catch (error) {
      console.error('Delete failed:', error);
      message.error('Failed to delete project: ' + error.message);
      fetchProjects();
    }
  };

  const handleModalOk = form.handleSubmit(async (values) => {
    try {
      if (editingProject) {
        try {
          const updatedProject = await apiService.updateProject(editingProject.id, values);
          setProjects(projects.map(p =>
            p.id === editingProject.id ? updatedProject : p
          ));
          message.success('Project updated successfully');
        } catch (error) {
          console.error('Update failed:', error);
          message.error('Failed to update project: ' + error.message);
          return;
        }
      } else {
        try {
          const newProject = await apiService.createProject(values);
          setProjects([newProject, ...projects]);
          message.success('Project created successfully');
        } catch (error) {
          console.error('Creation failed:', error);
          message.error('Failed to create project: ' + error.message);
          return;
        }
      }

      setModalVisible(false);
      form.reset({ status: 'active' });
    } catch (error) {
      console.error('Form submission failed:', error);
    }
  });

  // Pagination
  const totalPages = Math.ceil(projects.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedProjects = projects.slice(startIndex, endIndex);

  return (
    <div className="min-h-full space-y-8 sm:space-y-10 p-6">
      {/* Header Section */}
      <div className="bg-card border border-border rounded-lg shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between space-y-6 lg:space-y-0">
          <div>
            <h1 className="text-foreground text-3xl sm:text-4xl font-bold mb-4">
              All Projects
            </h1>
            <p className="text-muted-foreground text-lg sm:text-xl font-medium max-w-2xl">
              Manage and monitor your research projects
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Button
              onClick={fetchProjects}
              disabled={loading}
              variant="outline"
              className="flex items-center space-x-2"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              <span>Refresh</span>
            </Button>
            <Button
              onClick={handleCreateProject}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>New Project</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-destructive/10 border-l-4 border-l-destructive border border-destructive/20 rounded-md p-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-destructive rounded-full flex items-center justify-center">
                <span className="text-destructive-foreground text-sm font-semibold">!</span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-destructive font-semibold mb-2">Error Loading Projects</h3>
              <p className="text-destructive text-sm mb-4">{error}</p>
              <Button
                onClick={fetchProjects}
                variant="secondary"
              >
                Retry
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-lg shadow-sm p-8 text-center group cursor-pointer hover:shadow-md transition-shadow">
          <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-300">
            <FolderOpen className="text-3xl text-foreground" />
          </div>
          <div className="text-4xl font-bold text-foreground mb-3">
            {projects.length}
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            Total Projects
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg shadow-sm p-8 text-center group cursor-pointer hover:shadow-md transition-shadow">
          <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-300">
            <span className="text-3xl">📊</span>
          </div>
          <div className="text-4xl font-bold text-foreground mb-3">
            {projects.filter(p => {
              const oneWeekAgo = new Date();
              oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
              return new Date(p.created_at) > oneWeekAgo;
            }).length}
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            Recent Projects
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg shadow-sm p-8 text-center group cursor-pointer hover:shadow-md transition-shadow">
          <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-300">
            <FlaskConical className="text-3xl text-foreground" />
          </div>
          <div className="text-4xl font-bold text-foreground mb-3">
            {projects.filter(p => p.status === 'active').length}
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            Active Projects
          </div>
        </div>
      </div>

      {/* Projects Table */}
      <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="p-8 border-b border-border">
          <h3 className="text-foreground text-xl font-bold mb-3">
            All Projects
          </h3>
          <p className="text-muted-foreground text-base">
            Manage and monitor your research projects
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-bold">Project Name</TableHead>
                <TableHead className="font-bold">Description</TableHead>
                <TableHead className="font-bold">Created</TableHead>
                <TableHead className="font-bold">Updated</TableHead>
                <TableHead className="font-bold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <svg className="animate-spin h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="ml-2">Loading...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedProjects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No projects found
                  </TableCell>
                </TableRow>
              ) : (
                paginatedProjects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        <span className="font-semibold">{project.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md truncate">{project.description}</TableCell>
                    <TableCell>{project.created_at ? new Date(project.created_at).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell>{project.updated_at ? new Date(project.updated_at).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/projects/${project.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditProject(project)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => confirmDelete(project)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {projects.length > 0 && (
          <div className="flex items-center justify-between px-8 py-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-{Math.min(endIndex, projects.length)} of {projects.length} projects
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="text-sm">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteProject}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Modal */}
      <Dialog open={modalVisible} onOpenChange={setModalVisible}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
                <FolderOpen className="text-primary-foreground text-xl" />
              </div>
              <DialogTitle className="text-2xl">
                {editingProject ? 'Edit Research Project' : 'Create New Project'}
              </DialogTitle>
            </div>
          </DialogHeader>

          <form onSubmit={handleModalOk} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Project Name *</label>
                <Input
                  {...form.register("name", { required: 'Please enter project name' })}
                  placeholder="Enter research project name"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Target Protein</label>
                <Input
                  {...form.register("targetProtein")}
                  placeholder="Enter target protein identifier"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Research Description *</label>
              <Textarea
                {...form.register("description", { required: 'Please enter project description' })}
                rows={4}
                placeholder="Describe your research objectives and methodology"
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingProject ? 'Update Project' : 'Create Project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Projects;
