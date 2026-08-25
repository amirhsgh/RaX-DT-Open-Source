/**
 * Centralized API service for Virtual Screening Application
 * Handles all backend communication with proper error handling and response formatting
 */

class ApiService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    this.apiPrefix = '';  // No prefix needed since routes already include 
  }

  // Helper method for API calls
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${this.apiPrefix}${endpoint}`;
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies for authentication
    };

    // Don't set Content-Type for FormData
    if (options.body instanceof FormData) {
      delete defaultOptions.headers['Content-Type'];
    }

    try {
      const response = await fetch(url, { ...defaultOptions, ...options });

      // Check if response is ok first
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        // Try to get error details from JSON if available
        try {
          const contentType = response.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.detail || errorMessage;
          }
        } catch (parseError) {
          // If parsing fails, use default error message
        }

        throw new Error(errorMessage);
      }

      // Handle different response types for successful responses
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        // Try to parse JSON, but handle empty responses
        try {
          const text = await response.text();
          return text ? JSON.parse(text) : {};
        } catch (parseError) {
          console.warn('Failed to parse JSON response, returning empty object');
          return {};
        }
      } else if (contentType?.includes('text/csv')) {
        // Handle CSV downloads
        return response;
      } else {
        // For DELETE requests or other responses without JSON content
        // Check if there's any content
        try {
          const text = await response.text();
          if (text) {
            // Try to parse as JSON first
            try {
              return JSON.parse(text);
            } catch {
              // If not JSON, return as text
              return { message: text };
            }
          } else {
            // Empty response is OK for DELETE operations
            return { success: true };
          }
        } catch {
          return { success: true };
        }
      }
    } catch (error) {
      console.error(`API Request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // ========== PROJECTS API ==========

  async createProject(projectData) {
    return this.makeRequest('/projects/', {
      method: 'POST',
      body: JSON.stringify(projectData),
    });
  }

  async getProjects(skip = 0, limit = 100) {
    return this.makeRequest(`/projects/?skip=${skip}&limit=${limit}`);
  }

  async getProject(projectId) {
    return this.makeRequest(`/projects/${projectId}`);
  }

  async updateProject(projectId, projectData) {
    return this.makeRequest(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(projectData),
    });
  }

  async deleteProject(projectId) {
    return this.makeRequest(`/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  async getProjectStats() {
    return this.makeRequest('/projects/stats');
  }

  async getRecentProjects(limit = 5) {
    return this.makeRequest(`/projects/recent?limit=${limit}`);
  }

  // ========== JOBS API ==========

  async createJob(jobData) {
    return this.makeRequest('/jobs/', {
      method: 'POST',
      body: JSON.stringify(jobData),
    });
  }

  async getJobs(skip = 0, limit = 100, projectId = null, statusFilter = null) {
    let queryParams = `skip=${skip}&limit=${limit}`;
    if (projectId) queryParams += `&project_id=${projectId}`;
    if (statusFilter) queryParams += `&status_filter=${statusFilter}`;

    return this.makeRequest(`/jobs/?${queryParams}`);
  }

  async getJob(jobId) {
    return this.makeRequest(`/jobs/${jobId}`);
  }

  async getJobProgress(jobId) {
    return this.makeRequest(`/jobs/${jobId}/progress`);
  }

  async updateJob(jobId, updateData) {
    return this.makeRequest(`/jobs/${jobId}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    });
  }

  async startJob(jobId) {
    return this.makeRequest(`/jobs/${jobId}/start`, {
      method: 'POST',
    });
  }

  async cancelJob(jobId) {
    return this.makeRequest(`/jobs/${jobId}/cancel`, {
      method: 'POST',
    });
  }

  async pauseJob(jobId) {
    return this.makeRequest(`/jobs/${jobId}/pause`, {
      method: 'POST',
    });
  }

  async resumeJob(jobId) {
    return this.makeRequest(`/jobs/${jobId}/resume`, {
      method: 'POST',
    });
  }

  async getJobLogs(jobId) {
    return this.makeRequest(`/jobs/${jobId}/logs`);
  }

  async getTaskStatus(jobId) {
    return this.makeRequest(`/jobs/${jobId}/task-status`);
  }

  async deleteJob(jobId) {
    return this.makeRequest(`/jobs/${jobId}`, {
      method: 'DELETE',
    });
  }

  async getRecentJobs(limit = 5) {
    return this.makeRequest(`/jobs/recent?limit=${limit}`);
  }

  async getJobProtein(jobId) {
    return this.makeRequest(`/jobs/${jobId}/protein`);
  }

  // ========== MOLECULES API ==========

  async getJobLigands(jobId, skip = 0, limit = 100) {
    return this.makeRequest(`/molecules/ligands/${jobId}?skip=${skip}&limit=${limit}`);
  }

  async getLigandDetail(ligandId) {
    return this.makeRequest(`/molecules/ligands/detail/${ligandId}`);
  }

  async getJobResults(jobId, skip = 0, limit = 100, minAffinity = null, maxAffinity = null) {
    let queryParams = `skip=${skip}&limit=${limit}`;
    if (minAffinity !== null) queryParams += `&min_affinity=${minAffinity}`;
    if (maxAffinity !== null) queryParams += `&max_affinity=${maxAffinity}`;

    return this.makeRequest(`/molecules/results/${jobId}?${queryParams}`);
  }

  async getTopResults(jobId, limit = 50) {
    return this.makeRequest(`/molecules/results/top/${jobId}?limit=${limit}`);
  }

  async getResultDetail(resultId) {
    return this.makeRequest(`/molecules/results/detail/${resultId}`);
  }

  async exportResultsCSV(jobId, includeFailed = false) {
    return this.makeRequest(`/molecules/export/csv/${jobId}?include_failed=${includeFailed}`);
  }

  async getJobStatistics(jobId) {
    return this.makeRequest(`/molecules/stats/${jobId}`);
  }

  async getLigandStructure(ligandId) {
    return this.makeRequest(`/molecules/ligands/${ligandId}/structure`);
  }

  // ========== UPLOADS API ==========

  async getSupportedFormats() {
    return this.makeRequest('/uploads/formats');
  }

  async getUploadLimits() {
    return this.makeRequest('/uploads/limits');
  }

  async uploadLigands(jobId, file) {
    const formData = new FormData();
    formData.append('job_id', jobId);
    formData.append('file', file);

    return this.makeRequest('/uploads/ligands', {
      method: 'POST',
      body: formData,
    });
  }

  async uploadProtein(jobId, file) {
    const formData = new FormData();
    formData.append('job_id', jobId);
    formData.append('file', file);

    return this.makeRequest('/uploads/protein', {
      method: 'POST',
      body: formData,
    });
  }

  async uploadRefLigand(jobId, file) {
    const formData = new FormData();
    formData.append('job_id', jobId);
    formData.append('file', file);

    return this.makeRequest('/uploads/ref-ligand', {
      method: 'POST',
      body: formData,
    });
  }

  async batchUploadAndCreateJobs(projectId, ligandFiles, proteinFile, refLigandFile = null, jobNamePrefix = 'Batch Job', ligandsPerJob = 100) {
    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('protein_file', proteinFile);
    formData.append('job_name_prefix', jobNamePrefix);
    formData.append('ligands_per_job', ligandsPerJob);

    // Add all ligand files
    ligandFiles.forEach((file) => {
      formData.append('ligands_files', file);
    });

    // Add reference ligand if provided
    if (refLigandFile) {
      formData.append('ref_ligand_file', refLigandFile);
    }

    return this.makeRequest('/uploads/batch-upload', {
      method: 'POST',
      body: formData,
    });
  }

  async getJobFiles(jobId) {
    return this.makeRequest(`/uploads/files/${jobId}`);
  }

  async deleteFile(fileId) {
    return this.makeRequest(`/uploads/files/${fileId}`, {
      method: 'DELETE',
    });
  }

  // ========== VISUALIZATION API ==========

  async getLigandStructureViz(ligandId, includeDocked = true) {
    return this.makeRequest(`/visualization/structure/${ligandId}?include_docked=${includeDocked}`);
  }

  async getProteinStructureViz(jobId) {
    return this.makeRequest(`/visualization/protein/${jobId}`);
  }

  async getComplexStructureViz(ligandId) {
    return this.makeRequest(`/visualization/complex/${ligandId}`);
  }

  async getLigandPoses(ligandId) {
    return this.makeRequest(`/visualization/poses/${ligandId}`);
  }

  async downloadPose(ligandId, poseIndex, format = 'pdbqt') {
    const url = `${this.baseURL}/visualization/download/${ligandId}/${poseIndex}?format=${format}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `pose_${poseIndex + 1}.${format}`;
      if (contentDisposition) {
        const matches = contentDisposition.match(/filename=([^;]+)/);
        if (matches) {
          filename = matches[1].replace(/"/g, '');
        }
      }

      // Get the blob and trigger download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      return { success: true, filename };
    } catch (error) {
      console.error('Download failed:', error);
      throw error;
    }
  }

  // ========== CHATBOT API ==========

  async sendChatMessage(sessionId, message) {
    return this.makeRequest('/chat', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        message: message
      }),
    });
  }

  async getChatHistory(sessionId) {
    return this.makeRequest(`/chat/history/${sessionId}`);
  }

  async clearChatSession(sessionId) {
    return this.makeRequest(`/chat/clear/${sessionId}`, {
      method: 'DELETE',
    });
  }

  // Attach a file to a chat session. The kind (receptor / ligands /
  // reference ligand) is detected server-side from the file contents, so
  // the caller does not have to know which slot it belongs in.
  async uploadChatFile(sessionId, file) {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('file', file);
    return this.makeRequest('/chat/upload', {
      method: 'POST',
      body: formData,
    });
  }

  async getChatFiles(sessionId) {
    return this.makeRequest(`/chat/files/${sessionId}`);
  }

  // ========== GENERIC HTTP METHODS ==========

  async get(endpoint) {
    return this.makeRequest(endpoint, { method: 'GET' });
  }

  async post(endpoint, data = null) {
    const options = { method: 'POST' };
    if (data) {
      options.body = JSON.stringify(data);
    }
    return this.makeRequest(endpoint, options);
  }

  async put(endpoint, data = null) {
    const options = { method: 'PUT' };
    if (data) {
      options.body = JSON.stringify(data);
    }
    return this.makeRequest(endpoint, options);
  }

  async delete(endpoint) {
    return this.makeRequest(endpoint, { method: 'DELETE' });
  }

  // ========== PDB API ==========

  async searchPDBByProteinName(proteinName, maxResults = 50) {
    return this.makeRequest('/pdb/search/protein', {
      method: 'POST',
      body: JSON.stringify({
        protein_name: proteinName,
        max_results: maxResults
      }),
    });
  }

  async advancedPDBSearch(searchParams) {
    return this.makeRequest('/pdb/search/advanced', {
      method: 'POST',
      body: JSON.stringify(searchParams),
    });
  }

  async getPDBStructureInfo(pdbId) {
    return this.makeRequest(`/pdb/structure/${pdbId}`);
  }

  async downloadPDBStructure(pdbId, formatType = 'pdb') {
    return this.makeRequest('/pdb/download', {
      method: 'POST',
      body: JSON.stringify({
        pdb_id: pdbId,
        format_type: formatType
      }),
    });
  }

  async comparePDBStructures(pdbIds) {
    return this.makeRequest('/pdb/compare', {
      method: 'POST',
      body: JSON.stringify({
        pdb_ids: pdbIds
      }),
    });
  }

  async searchSimilarPDBStructures(pdbId, similarityCutoff = 0.9, maxResults = 20) {
    return this.makeRequest('/pdb/search/similar', {
      method: 'POST',
      body: JSON.stringify({
        pdb_id: pdbId,
        similarity_cutoff: similarityCutoff,
        max_results: maxResults
      }),
    });
  }

  async getPDBFormats() {
    return this.makeRequest('/pdb/formats');
  }

  async getPDBExperimentalMethods() {
    return this.makeRequest('/pdb/experimental-methods');
  }

  async getPDBStats() {
    return this.makeRequest('/pdb/stats');
  }

  // ========== BENCHMARK API ==========

  async getBenchmarkTargets() {
    return this.makeRequest('/benchmark/targets');
  }

  async getBenchmarkPresets() {
    return this.makeRequest('/benchmark/presets');
  }

  async createBenchmarkRun(runData) {
    return this.makeRequest('/benchmark/runs', {
      method: 'POST',
      body: JSON.stringify(runData),
    });
  }

  async getBenchmarkRuns(skip = 0, limit = 50) {
    return this.makeRequest(`/benchmark/runs?skip=${skip}&limit=${limit}`);
  }

  async getBenchmarkRun(runId) {
    return this.makeRequest(`/benchmark/runs/${runId}`);
  }

  async cancelBenchmarkRun(runId) {
    return this.makeRequest(`/benchmark/runs/${runId}/cancel`, {
      method: 'POST',
    });
  }

  async resumeBenchmarkRun(runId) {
    return this.makeRequest(`/benchmark/runs/${runId}/resume`, {
      method: 'POST',
    });
  }

  benchmarkExportCsvUrl(runId) {
    return `${this.baseURL}${this.apiPrefix}/benchmark/runs/${runId}/export.csv`;
  }

  // ========== REDOCKING (POSE ACCURACY) API ==========

  async getRedockingDefaults() {
    return this.makeRequest('/redocking/defaults');
  }

  async createRedockingRun(runData) {
    return this.makeRequest('/redocking/runs', {
      method: 'POST',
      body: JSON.stringify(runData),
    });
  }

  async getRedockingRuns(skip = 0, limit = 50) {
    return this.makeRequest(`/redocking/runs?skip=${skip}&limit=${limit}`);
  }

  async getRedockingRun(runId) {
    return this.makeRequest(`/redocking/runs/${runId}`);
  }

  async cancelRedockingRun(runId) {
    return this.makeRequest(`/redocking/runs/${runId}/cancel`, {
      method: 'POST',
    });
  }

  async resumeRedockingRun(runId) {
    return this.makeRequest(`/redocking/runs/${runId}/resume`, {
      method: 'POST',
    });
  }

  redockingExportCsvUrl(runId) {
    return `${this.baseURL}${this.apiPrefix}/redocking/runs/${runId}/export.csv`;
  }

  redockingExportJsonUrl(runId) {
    return `${this.baseURL}${this.apiPrefix}/redocking/runs/${runId}/export.json`;
  }

  benchmarkExportJsonUrl(runId) {
    return `${this.baseURL}${this.apiPrefix}/benchmark/runs/${runId}/export.json`;
  }

  // ========== SYSTEM API ==========

  async healthCheck() {
    return this.makeRequest('/health', { method: 'GET' });
  }

  async getSystemInfo() {
    return this.makeRequest('/', { method: 'GET' });
  }
}

// Create and export a singleton instance
const apiService = new ApiService();
export default apiService;

// Export individual service methods for convenience
export const {
  // Generic HTTP methods
  get,
  post,
  put,
  delete: deleteMethod,

  // Projects
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  getProjectStats,
  getRecentProjects,

  // Jobs
  createJob,
  getJobs,
  getJob,
  getJobProgress,
  updateJob,
  startJob,
  cancelJob,
  pauseJob,
  resumeJob,
  deleteJob,
  getRecentJobs,
  getJobProtein,
  getJobLogs,
  getTaskStatus,

  // Molecules
  getJobLigands,
  getLigandDetail,
  getJobResults,
  getTopResults,
  getResultDetail,
  exportResultsCSV,
  getJobStatistics,
  getLigandStructure,

  // Uploads
  getSupportedFormats,
  getUploadLimits,
  uploadLigands,
  uploadProtein,
  uploadRefLigand,
  batchUploadAndCreateJobs,
  getJobFiles,
  deleteFile,

  // Visualization
  getLigandStructureViz,
  getProteinStructureViz,
  getComplexStructureViz,
  getLigandPoses,
  downloadPose,

  // Chatbot
  sendChatMessage,
  getChatHistory,
  clearChatSession,
  uploadChatFile,
  getChatFiles,

  // PDB API
  searchPDBByProteinName,
  advancedPDBSearch,
  getPDBStructureInfo,
  downloadPDBStructure,
  comparePDBStructures,
  searchSimilarPDBStructures,
  getPDBFormats,
  getPDBExperimentalMethods,
  getPDBStats,

  // Benchmark
  getBenchmarkTargets,
  getBenchmarkPresets,
  createBenchmarkRun,
  getBenchmarkRuns,
  getBenchmarkRun,
  cancelBenchmarkRun,
  resumeBenchmarkRun,

  // Redocking
  getRedockingDefaults,
  createRedockingRun,
  getRedockingRuns,
  getRedockingRun,
  cancelRedockingRun,
  resumeRedockingRun,
  redockingExportCsvUrl,
  redockingExportJsonUrl,
  benchmarkExportCsvUrl,
  benchmarkExportJsonUrl,

  // System
  healthCheck,
  getSystemInfo,
} = apiService;