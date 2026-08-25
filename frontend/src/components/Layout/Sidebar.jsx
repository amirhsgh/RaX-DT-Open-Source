import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  FolderKanban,
  TestTube,
  Database,
  Bot,
  Globe,
  Dna,
  HelpCircle,
  Box,
  BarChart3
} from 'lucide-react';
import { cn } from '../../utils/cn';

const Sidebar = ({ collapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/overview',
      icon: LayoutGrid,
      label: 'Overview',
    },
    {
      key: '/projects',
      icon: FolderKanban,
      label: 'Projects',
    },
    {
      key: '/protein-preparation',
      icon: TestTube,
      label: 'Protein Preparation',
    },
    {
      key: '/pubchem',
      icon: Database,
      label: 'PubChem',
    },
    {
      key: '/pdb',
      icon: Globe,
      label: 'PDB Database',
    },
    {
      key: '/chatbot',
      icon: Bot,
      label: 'Chatbot',
    },
    {
      key: '/binding-box',
      icon: Box,
      label: 'Binding Box Comparator',
    },
    {
      key: '/benchmark',
      icon: BarChart3,
      label: 'Benchmark',
    },
    {
      key: '/help',
      icon: HelpCircle,
      label: 'Help & Tutorial',
    },
  ];

  const handleMenuClick = (key) => {
    navigate(key);
  };

  const getSelectedKeys = () => {
    const path = location.pathname;
    if (path === '/' || path.startsWith('/overview')) return ['/overview'];
    if (path.startsWith('/projects/')) return ['/projects'];
    if (path.startsWith('/protein-preparation')) return ['/protein-preparation'];
    if (path.startsWith('/pubchem')) return ['/pubchem'];
    if (path.startsWith('/pdb')) return ['/pdb'];
    if (path.startsWith('/chatbot')) return ['/chatbot'];
    if (path.startsWith('/binding-box')) return ['/binding-box'];
    if (path.startsWith('/benchmark')) return ['/benchmark'];
    if (path.startsWith('/help')) return ['/help'];
    return [path];
  };

  return (
    <aside
      className={cn(
        'bg-sidebar border-r border-sidebar-border shadow-sm transition-all duration-200 z-40 fixed left-0 top-16 bottom-0',
        collapsed ? 'w-16' : 'w-[280px]'
      )}
      style={{
        overflow: 'auto',
        height: 'calc(100vh - 64px)',
      }}
    >
      {/* Logo/Branding when collapsed */}
      {collapsed && (
        <div className="flex items-center justify-center h-16 border-b border-sidebar-border">
          <Dna className="w-6 h-6 text-sidebar-primary" />
        </div>
      )}

      {/* Navigation Menu */}
      <nav className="pt-4 px-2 pb-24">
        {menuItems.map((item) => {
          const isActive = getSelectedKeys().includes(item.key);
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => handleMenuClick(item.key)}
              className={cn(
                'w-full flex items-center px-4 py-3 mb-1 rounded-lg cursor-pointer',
                'transition-all duration-200 ease-in-out',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                collapsed && 'justify-center'
              )}
            >
              <Icon className={cn('w-5 h-5', !collapsed && 'mr-3')} />
              {!collapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom section when not collapsed */}
      {!collapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border bg-sidebar">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-2 font-medium">
              Molecular Design Suite
            </div>
            <div className="flex items-center justify-center space-x-2">
              <TestTube className="w-4 h-4 text-sidebar-primary" />
              <Dna className="w-4 h-4 text-sidebar-primary" />
              <Database className="w-4 h-4 text-sidebar-primary" />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
