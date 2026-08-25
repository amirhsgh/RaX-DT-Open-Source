import { useContext } from 'react';
import { useTheme as useThemeContext } from '../contexts/ThemeContext';

/**
 * Custom hook for accessing theme context
 * Re-export for consistency with other hooks
 */
export function useTheme() {
  return useThemeContext();
}

export default useTheme;
