import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import './App.css';
import { ThemeProvider } from './contexts/ThemeContext';

// Components
import Header from './components/Layout/Header.jsx';
import Sidebar from './components/Layout/Sidebar.jsx';

// Pages
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import JobDetail from './pages/JobDetail';
import Results from './pages/Results';
import ProteinPreparation from './pages/ProteinPreparation';
import PubChem from './pages/PubChem';
import PDBDatabase from './pages/PDBDatabase';
import ChatbotTab from './pages/ChatbotTab';
import Overview from './pages/Overview.jsx';
import HelpWorkflow from './pages/HelpWorkflow';
import BindingBoxComparator from './pages/BindingBoxComparator';
import Benchmark from './pages/Benchmark';

function App() {
  const [collapsed, setCollapsed] = useState(false);

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  return (
    <ThemeProvider>
      <Router>
        <Toaster position="top-right" richColors />
        <div className="main-layout min-h-screen bg-background">
          <div className="fixed top-0 left-0 right-0 z-50">
            <Header collapsed={collapsed} onToggle={toggleSidebar} />
          </div>
          <div className="flex mt-16">
            <Sidebar collapsed={collapsed} />
            <main className="flex-1 transition-all duration-300 min-h-[calc(100vh-64px)] overflow-auto bg-background" style={{ marginLeft: collapsed ? 64 : 280 }}>
              <div className="main-container py-6 sm:py-8 lg:py-12">
                <div className="animate-fade-in-up">
                  <Routes>
                    <Route path="/" element={<Overview />} />
                    <Route path="/overview" element={<Overview />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/projects/:projectId" element={<ProjectDetail />} />
                    <Route path="/jobs/:jobId" element={<JobDetail />} />
                    <Route path="/results/:jobId" element={<Results />} />
                    <Route path="/protein-preparation" element={<ProteinPreparation />} />
                    <Route path="/pubchem" element={<PubChem />} />
                    <Route path="/pdb" element={<PDBDatabase />} />
                    <Route path="/chatbot" element={<ChatbotTab />} />
                    <Route path="/binding-box" element={<BindingBoxComparator />} />
                    <Route path="/benchmark" element={<Benchmark />} />
                    <Route path="/help" element={<HelpWorkflow />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </div>
              </div>
            </main>
          </div>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
