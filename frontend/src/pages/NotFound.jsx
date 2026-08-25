import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { Navbar, Footer } from '../components/layout';

/**
 * 404 Not Found Page
 * Friendly error page for invalid routes
 */
export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col">
      <Navbar />

      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl">
          {/* 404 Animation */}
          <div className="mb-8">
            <div className="text-9xl font-bold text-primary-500 mb-4 animate-pulse">
              404
            </div>
            <div className="text-6xl mb-4">🧬</div>
          </div>

          {/* Message */}
          <h1 className="text-4xl font-bold text-neutral-900 dark:text-white mb-4">
            Page Not Found
          </h1>
          <p className="text-xl text-neutral-600 dark:text-neutral-400 mb-8">
            Oops! The page you're looking for seems to have vanished into the molecular void.
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/')}
            >
              Go Home
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate(-1)}
            >
              Go Back
            </Button>
          </div>

          {/* Helpful Links */}
          <div className="mt-12 pt-8 border-t border-neutral-200 dark:border-neutral-800">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              You might be looking for:
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => navigate('/overview')}
                className="text-primary-500 hover:text-primary-600 text-sm font-medium"
              >
                Dashboard
              </button>
              <button
                onClick={() => navigate('/projects')}
                className="text-primary-500 hover:text-primary-600 text-sm font-medium"
              >
                Projects
              </button>
              <button
                onClick={() => navigate('/help')}
                className="text-primary-500 hover:text-primary-600 text-sm font-medium"
              >
                Help Center
              </button>
              <button
                onClick={() => navigate('/contact')}
                className="text-primary-500 hover:text-primary-600 text-sm font-medium"
              >
                Contact Support
              </button>
            </div>
          </div>

          {/* Error Code */}
          <p className="mt-8 text-xs text-neutral-400 dark:text-neutral-600 font-mono">
            ERROR_CODE: ROUTE_NOT_FOUND
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default NotFound;
