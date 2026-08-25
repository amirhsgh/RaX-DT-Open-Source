import React from 'react';

const WhyItMatters = () => {
  const benefits = [
    {
      icon: '🎯',
      title: 'Personalized Medicine',
      description: 'Move beyond one-size-fits-all healthcare to treatments tailored specifically for your genetic makeup.'
    },
    {
      icon: '⚡',
      title: 'Early Detection',
      description: 'Identify potential health risks decades before symptoms appear, enabling proactive prevention strategies.'
    },
    {
      icon: '🧠',
      title: 'Informed Decisions',
      description: 'Make evidence-based choices about diet, exercise, supplements, and lifestyle based on your DNA.'
    },
    {
      icon: '👨‍👩‍👧‍👦',
      title: 'Family Planning',
      description: 'Understand hereditary conditions and make informed decisions about your family\'s genetic health.'
    }
  ];

  const statistics = [
    { number: '99.9%', label: 'Accuracy Rate', description: 'Industry-leading precision in genetic analysis' },
    { number: '10M+', label: 'Variants Analyzed', description: 'Comprehensive coverage of genetic markers' },
    { number: '500+', label: 'Health Conditions', description: 'Conditions screened in our analysis' },
    { number: '24/7', label: 'Support Available', description: 'Expert genetic counselors on standby' }
  ];

  return (
    <section className="py-16 bg-gray-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <svg className="w-full h-full" viewBox="0 0 60 60" fill="none">
          <defs>
            <pattern id="molecule-pattern" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
              <circle cx="30" cy="30" r="2" fill="currentColor" />
              <circle cx="10" cy="10" r="1.5" fill="currentColor" />
              <circle cx="50" cy="10" r="1.5" fill="currentColor" />
              <circle cx="10" cy="50" r="1.5" fill="currentColor" />
              <circle cx="50" cy="50" r="1.5" fill="currentColor" />
              <line x1="30" y1="30" x2="10" y2="10" stroke="currentColor" strokeWidth="0.5" />
              <line x1="30" y1="30" x2="50" y2="10" stroke="currentColor" strokeWidth="0.5" />
              <line x1="30" y1="30" x2="10" y2="50" stroke="currentColor" strokeWidth="0.5" />
              <line x1="30" y1="30" x2="50" y2="50" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#molecule-pattern)" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                Why Genetic Testing Matters
              </h2>
              <p className="text-xl text-gray-600 leading-relaxed mb-8">
                Your DNA holds the blueprint to your unique health profile. Understanding your genetic
                predispositions empowers you to take control of your health journey with precision
                and confidence.
              </p>
            </div>

            {/* Benefits */}
            <div className="space-y-6">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                    <span className="text-2xl">{benefit.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{benefit.title}</h3>
                    <p className="text-gray-600 leading-relaxed">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-6">
              <button className="bg-gray-900 text-white px-8 py-3 rounded-xl hover:bg-gray-800 transition-colors">
                Start Your Journey
              </button>
            </div>
          </div>

          {/* Statistics and Illustration */}
          <div className="space-y-8">
            {/* DNA Illustration */}
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="aspect-square flex items-center justify-center relative">
                {/* DNA Double Helix SVG */}
                <svg
                  className="w-full h-full max-w-sm text-gray-300"
                  viewBox="0 0 300 400"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Left strand */}
                  <path
                    d="M100 50 Q80 100 100 150 Q120 200 100 250 Q80 300 100 350"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  {/* Right strand */}
                  <path
                    d="M200 50 Q220 100 200 150 Q180 200 200 250 Q220 300 200 350"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />

                  {/* Base pairs */}
                  {Array.from({ length: 15 }, (_, i) => {
                    const y = 60 + i * 20;
                    const leftX = 100 + Math.sin(i * 0.4) * 20;
                    const rightX = 200 - Math.sin(i * 0.4) * 20;
                    return (
                      <g key={i}>
                        <line
                          x1={leftX}
                          y1={y}
                          x2={rightX}
                          y2={y}
                          stroke="currentColor"
                          strokeWidth="2"
                          opacity="0.7"
                        />
                        <circle cx={leftX} cy={y} r="3" fill="currentColor" />
                        <circle cx={rightX} cy={y} r="3" fill="currentColor" />
                      </g>
                    );
                  })}
                </svg>

                {/* Floating data points */}
                <div className="absolute top-4 right-4 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-blue-600">A</span>
                </div>
                <div className="absolute top-1/3 left-4 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-green-600">T</span>
                </div>
                <div className="absolute bottom-1/3 right-8 w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-yellow-600">G</span>
                </div>
                <div className="absolute bottom-4 left-8 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-red-600">C</span>
                </div>
              </div>
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-2 gap-4">
              {statistics.map((stat, index) => (
                <div key={index} className="bg-white p-6 rounded-2xl shadow-md text-center">
                  <div className="text-3xl font-bold text-gray-900 mb-2">{stat.number}</div>
                  <div className="text-sm font-bold text-gray-900 mb-1">{stat.label}</div>
                  <div className="text-xs text-gray-600">{stat.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Quote Section */}
        <div className="mt-16 bg-white p-8 rounded-2xl shadow-md text-center">
          <div className="max-w-4xl mx-auto">
            <div className="text-6xl text-gray-200 mb-4">"</div>
            <blockquote className="text-2xl text-gray-700 font-medium mb-6 italic">
              Understanding your genetics is not about predicting your future—it's about empowering
              your present to make informed decisions for a healthier tomorrow.
            </blockquote>
            <div className="flex items-center justify-center space-x-4">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-lg">👩‍⚕️</span>
              </div>
              <div className="text-left">
                <div className="font-bold text-gray-900">Dr. Sarah Chen</div>
                <div className="text-gray-600 text-sm">Chief Genetic Counselor</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyItMatters;