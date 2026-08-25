import React, { useState, useEffect } from 'react';

const GeneticDashboard = () => {
  const [readinessScore, setReadinessScore] = useState(0);

  // Animate the readiness score on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setReadinessScore(87);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const metrics = [
    {
      title: 'Genetic Variants Analyzed',
      value: '2,847,392',
      change: '+5.2%',
      positive: true,
      icon: '🧬'
    },
    {
      title: 'Health Insights Generated',
      value: '127',
      change: '+12.3%',
      positive: true,
      icon: '💡'
    },
    {
      title: 'Risk Assessments',
      value: '34',
      change: '+2.1%',
      positive: true,
      icon: '⚠️'
    },
    {
      title: 'Actionable Recommendations',
      value: '89',
      change: '+8.7%',
      positive: true,
      icon: '📋'
    }
  ];

  const riskFactors = [
    { condition: 'Type 2 Diabetes', risk: 'Low', percentage: 15, color: 'bg-green-500' },
    { condition: 'Heart Disease', risk: 'Moderate', percentage: 35, color: 'bg-yellow-500' },
    { condition: 'Alzheimer\'s Disease', risk: 'Low', percentage: 20, color: 'bg-green-500' },
    { condition: 'Certain Cancers', risk: 'High', percentage: 65, color: 'bg-red-500' },
    { condition: 'Obesity', risk: 'Moderate', percentage: 42, color: 'bg-yellow-500' }
  ];

  const geneticTraits = [
    { trait: 'Caffeine Metabolism', result: 'Fast Metabolizer', impact: 'Normal coffee tolerance' },
    { trait: 'Lactose Tolerance', result: 'Tolerant', impact: 'Can digest dairy products' },
    { trait: 'Alcohol Metabolism', result: 'Normal', impact: 'Typical alcohol processing' },
    { trait: 'Muscle Fiber Type', result: 'Mixed', impact: 'Balanced endurance/power' }
  ];

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Genetic Dashboard</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Monitor your genetic analysis progress and explore personalized health insights
            based on your unique genetic profile.
          </p>
        </div>

        {/* Readiness Score */}
        <div className="bg-gray-50 rounded-2xl p-8 mb-12">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-gray-900 mb-8">Health Readiness Score</h3>
            <div className="relative inline-flex items-center justify-center w-48 h-48">
              <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="6"
                  fill="transparent"
                  className="text-gray-200"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - readinessScore / 100)}`}
                  className="text-gray-900 transition-all duration-1000 ease-out"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl font-bold text-gray-900">{readinessScore}</div>
                  <div className="text-gray-600 font-medium">Score</div>
                </div>
              </div>
            </div>
            <p className="text-gray-600 mt-4 max-w-md mx-auto">
              Your genetic readiness score indicates excellent preparation for personalized health optimization.
            </p>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {metrics.map((metric, index) => (
            <div key={index} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">{metric.icon}</span>
                </div>
                <span className={`text-sm font-semibold px-2 py-1 rounded-full ${
                  metric.positive ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
                }`}>
                  {metric.change}
                </span>
              </div>
              <h3 className="text-sm font-medium text-gray-600 mb-2">{metric.title}</h3>
              <p className="text-3xl font-bold text-gray-900">{metric.value}</p>
            </div>
          ))}
        </div>

        {/* Risk Assessment and Traits */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Disease Risk Assessment */}
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Disease Risk Assessment</h3>
            <div className="space-y-6">
              {riskFactors.map((factor, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-900">{factor.condition}</span>
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                      factor.risk === 'Low' ? 'text-green-700 bg-green-100' :
                      factor.risk === 'Moderate' ? 'text-yellow-700 bg-yellow-100' :
                      'text-red-700 bg-red-100'
                    }`}>
                      {factor.risk} Risk
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 ${factor.color}`}
                      style={{ width: `${factor.percentage}%` }}
                    />
                  </div>
                  <div className="text-sm text-gray-600">{factor.percentage}% genetic predisposition</div>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-600">
                💡 <strong>Note:</strong> These are genetic predispositions, not definitive outcomes.
                Lifestyle factors significantly influence actual risk.
              </p>
            </div>
          </div>

          {/* Genetic Traits */}
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Genetic Traits Analysis</h3>
            <div className="space-y-6">
              {geneticTraits.map((trait, index) => (
                <div key={index} className="border-l-4 border-gray-900 pl-4">
                  <h4 className="font-bold text-gray-900 mb-1">{trait.trait}</h4>
                  <p className="text-gray-700 font-medium mb-1">{trait.result}</p>
                  <p className="text-sm text-gray-600">{trait.impact}</p>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <button className="w-full bg-gray-900 text-white py-3 rounded-xl hover:bg-gray-800 transition-colors">
                View Detailed Report
              </button>
            </div>
          </div>
        </div>

        {/* Action Items */}
        <div className="mt-12 bg-gray-50 rounded-2xl p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">Recommended Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-md text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🍎</span>
              </div>
              <h4 className="font-bold text-gray-900 mb-2">Nutrition Plan</h4>
              <p className="text-gray-600 text-sm mb-4">Personalized diet recommendations based on your genetic profile</p>
              <button className="text-gray-900 font-semibold hover:underline">Learn More →</button>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-md text-center">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🏃‍♂️</span>
              </div>
              <h4 className="font-bold text-gray-900 mb-2">Exercise Program</h4>
              <p className="text-gray-600 text-sm mb-4">Optimized fitness routine matching your genetic strengths</p>
              <button className="text-gray-900 font-semibold hover:underline">Start Now →</button>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-md text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">💊</span>
              </div>
              <h4 className="font-bold text-gray-900 mb-2">Supplement Guide</h4>
              <p className="text-gray-600 text-sm mb-4">Targeted supplements based on your genetic variants</p>
              <button className="text-gray-900 font-semibold hover:underline">View Guide →</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default GeneticDashboard;