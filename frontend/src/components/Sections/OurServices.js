import React from 'react';

const OurServices = () => {
  const services = [
    {
      icon: '🏥',
      title: 'Genetic Health Assessment',
      description: 'Comprehensive genetic analysis to identify health risks and predispositions.',
      features: ['Disease risk assessment', 'Hereditary conditions', 'Preventive insights'],
      price: 'Starting at $299',
      popular: true
    },
    {
      icon: '🌍',
      title: 'Ancestry & Heritage',
      description: 'Discover your genetic origins and trace your ancestral lineage.',
      features: ['Geographic origins', 'Ethnic composition', 'Migration patterns'],
      price: 'Starting at $149',
      popular: false
    },
    {
      icon: '👨‍👩‍👧‍👦',
      title: 'Carrier Screening',
      description: 'Identify genetic variants that could be passed to future children.',
      features: ['Recessive disorders', 'Family planning', 'Genetic counseling'],
      price: 'Starting at $199',
      popular: false
    },
    {
      icon: '🍎',
      title: 'Nutrigenomics',
      description: 'Personalized nutrition recommendations based on your genetic profile.',
      features: ['Dietary optimization', 'Metabolism insights', 'Supplement guidance'],
      price: 'Starting at $179',
      popular: false
    },
    {
      icon: '💊',
      title: 'Pharmacogenetics',
      description: 'Understand how your genetics affect medication response and dosing.',
      features: ['Drug interactions', 'Dosage optimization', 'Side effect prediction'],
      price: 'Starting at $249',
      popular: false
    }
  ];

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Our Services</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Comprehensive genetic testing and analysis services designed to unlock insights
            about your health, ancestry, and genetic predispositions.
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <div
              key={index}
              className={`relative bg-white border rounded-2xl shadow-md hover:shadow-lg hover:scale-105 transition-all duration-300 overflow-hidden ${
                service.popular ? 'border-gray-900 ring-2 ring-gray-900 ring-opacity-20' : 'border-gray-200'
              }`}
            >
              {/* Popular Badge */}
              {service.popular && (
                <div className="absolute top-4 right-4 bg-gray-900 text-white px-3 py-1 rounded-full text-xs font-bold">
                  POPULAR
                </div>
              )}

              <div className="p-6">
                {/* Icon */}
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-6">
                  <span className="text-3xl">{service.icon}</span>
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-gray-900 mb-3">{service.title}</h3>
                <p className="text-gray-600 mb-6 leading-relaxed">{service.description}</p>

                {/* Features */}
                <ul className="space-y-2 mb-6">
                  {service.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center text-sm text-gray-600">
                      <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Price */}
                <div className="mb-6">
                  <span className="text-2xl font-bold text-gray-900">{service.price}</span>
                </div>

                {/* CTA Button */}
                <button className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                  service.popular
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}>
                  {service.popular ? 'Get Started' : 'Learn More'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <div className="bg-gray-50 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              Need a Custom Analysis Package?
            </h3>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
              Our genetic counselors can create a personalized testing package tailored to your specific needs and health goals.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="bg-gray-900 text-white px-8 py-3 rounded-xl hover:bg-gray-800 transition-colors">
                Schedule Consultation
              </button>
              <button className="border border-gray-300 text-gray-700 px-8 py-3 rounded-xl hover:bg-gray-50 transition-colors">
                Compare Packages
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OurServices;