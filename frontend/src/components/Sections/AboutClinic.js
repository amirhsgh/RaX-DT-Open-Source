import React from 'react';

const AboutClinic = () => {
  const features = [
    {
      icon: '🎯',
      title: 'Precision',
      description: 'Advanced genetic analysis with 99.9% accuracy using cutting-edge sequencing technology.'
    },
    {
      icon: '🔬',
      title: 'Innovation',
      description: 'Leading-edge research and breakthrough discoveries in personalized medicine.'
    },
    {
      icon: '👤',
      title: 'Personalization',
      description: 'Tailored genetic insights and recommendations based on your unique DNA profile.'
    }
  ];

  return (
    <section className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                About Our Clinic
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                We are a leading genetic analysis platform committed to advancing personalized medicine
                through cutting-edge genomic research and clinical applications. Our state-of-the-art
                laboratory combines precision technology with expert genetic counseling.
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="bg-white p-6 rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-300"
                >
                  <div className="text-3xl mb-4">{feature.icon}</div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>

            <div className="flex space-x-4">
              <button className="bg-gray-900 text-white px-6 py-3 rounded-xl hover:bg-gray-800 transition-colors">
                Learn More
              </button>
              <button className="border border-gray-300 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors">
                View Research
              </button>
            </div>
          </div>

          {/* DNA Illustration */}
          <div className="relative">
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="aspect-square flex items-center justify-center">
                {/* DNA Helix SVG */}
                <svg
                  className="w-full h-full max-w-md text-gray-300"
                  viewBox="0 0 400 400"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* DNA Helix Structure */}
                  <path
                    d="M200 50 C240 80 240 120 200 150 C160 180 160 220 200 250 C240 280 240 320 200 350"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                  />
                  <path
                    d="M200 50 C160 80 160 120 200 150 C240 180 240 220 200 250 C160 280 160 320 200 350"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                  />

                  {/* Base Pairs */}
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                    <g key={i}>
                      <line
                        x1={160 + (i % 2) * 40}
                        y1={70 + i * 30}
                        x2={240 - (i % 2) * 40}
                        y2={70 + i * 30}
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <circle cx={160 + (i % 2) * 40} cy={70 + i * 30} r="4" fill="currentColor" />
                      <circle cx={240 - (i % 2) * 40} cy={70 + i * 30} r="4" fill="currentColor" />
                    </g>
                  ))}
                </svg>
              </div>

              {/* Floating Elements */}
              <div className="absolute top-4 right-4 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-lg">🔬</span>
              </div>
              <div className="absolute bottom-4 left-4 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-lg">🧬</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutClinic;