import React from 'react';
import {
  Bell,
  Menu,
  X,
  Moon,
  Sun,
  Dna
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../UI/Button';

const Header = ({ collapsed, onToggle }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="h-16 px-6 sm:px-8 lg:px-12 flex items-center justify-between bg-background border-b border-border fixed top-0 left-0 right-0 z-50">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="w-10 h-10"
        >
          {collapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
        </Button>
        <div className="ml-4 sm:ml-6 flex items-center">
          <Dna className="w-7 h-7 sm:w-8 sm:h-8 mr-3 sm:mr-4 text-primary" />
          <h1 className="text-foreground font-bold text-lg sm:text-xl md:text-2xl">
            BioForge
          </h1>
        </div>
      </div>

      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="w-10 h-10"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>

        {/* Notifications */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="w-10 h-10"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
          </Button>
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
            3
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
