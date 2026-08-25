import React, { useState } from 'react';
import { Navbar, Footer } from '../components/layout';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/UI/Card';
import { Input } from '../components/UI/Input';
import { Badge } from '../components/UI/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/UI/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/UI/accordion';
import { Book, Search, HelpCircle, MessageSquare, Workflow, Mail } from 'lucide-react';

/**
 * Help/Documentation Page
 * Comprehensive help and documentation for users
 */
export function Help() {
  const [searchQuery, setSearchQuery] = useState('');

  const sections = [
    {
      title: 'Getting Started',
      icon: '🚀',
      articles: [
        { title: 'Welcome to BioForge', badge: 'New' },
        { title: 'Quick Start Guide', badge: 'Popular' },
        { title: 'Creating Your First Project' },
        { title: 'Understanding the Dashboard' },
      ],
    },
    {
      title: 'Molecular Docking',
      icon: '🧪',
      articles: [
        { title: 'Introduction to Molecular Docking', badge: 'Popular' },
        { title: 'Preparing Proteins for Docking' },
        { title: 'Ligand Selection and Preparation' },
        { title: 'Running Docking Simulations' },
        { title: 'Interpreting Docking Results' },
      ],
    },
    {
      title: 'Protein Preparation',
      icon: '🧬',
      articles: [
        { title: 'Protein Preparation Overview' },
        { title: 'Fetching from PDB Database' },
        { title: 'Adding Hydrogens and Charges' },
        { title: 'Binding Site Detection' },
      ],
    },
    {
      title: 'Database Integration',
      icon: '📊',
      articles: [
        { title: 'PubChem Integration Guide', badge: 'Popular' },
        { title: 'Searching Chemical Compounds' },
        { title: 'PDB Structure Retrieval' },
        { title: 'Batch Compound Import' },
      ],
    },
    {
      title: 'AI Assistant',
      icon: '🤖',
      articles: [
        { title: 'Using the AI Chatbot', badge: 'New' },
        { title: 'AI-Powered Result Analysis' },
        { title: 'Natural Language Queries' },
      ],
    },
    {
      title: 'Visualization',
      icon: '👁️',
      articles: [
        { title: '3D Molecular Visualization' },
        { title: 'Interaction Analysis' },
        { title: 'Exporting Visualizations' },
      ],
    },
    {
      title: 'Best Practices',
      icon: '⭐',
      articles: [
        { title: 'Docking Parameters Optimization' },
        { title: 'Result Validation Strategies' },
        { title: 'Performance Tips' },
      ],
    },
    {
      title: 'Troubleshooting',
      icon: '🔧',
      articles: [
        { title: 'Common Errors and Solutions' },
        { title: 'Performance Issues' },
        { title: 'File Format Problems' },
      ],
    },
  ];

  const faqs = [
    {
      question: 'What file formats are supported for protein structures?',
      answer: 'BioForge supports PDB, PDBQT, MOL2, and SDF formats for protein structures.',
    },
    {
      question: 'How long does a typical docking simulation take?',
      answer: 'Docking time varies based on protein size and number of ligands, typically ranging from a few minutes to several hours for large-scale screening.',
    },
    {
      question: 'Can I run multiple docking jobs simultaneously?',
      answer: 'Yes, BioForge supports parallel job execution. You can submit multiple jobs and they will be queued and processed based on available resources.',
    },
    {
      question: 'How do I interpret the docking scores?',
      answer: 'Lower (more negative) scores generally indicate stronger binding affinity. Scores are typically in kcal/mol units. Consult the documentation for detailed scoring function information.',
    },
    {
      question: 'Is my data secure and private?',
      answer: 'Yes, all data is encrypted in transit and at rest. We follow industry best practices for data security and privacy.',
    },
  ];

  const filteredSections = sections.filter(section =>
    section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    section.articles.some(article =>
      article.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background-light-primary via-background-light-secondary to-background-light-tertiary dark:from-background-dark-primary dark:via-background-dark-secondary dark:to-background-dark-tertiary">
      <Navbar />

      {/* Main Container with proper spacing */}
      <div className="pt-32 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-16">

          {/* Header Section - Well spaced */}
          <div className="text-center space-y-8">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-primary-500 to-primary-600 rounded-3xl shadow-glow-purple animate-float">
              <HelpCircle className="w-12 h-12 text-white" />
            </div>

            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-bold text-text-light-primary dark:text-text-dark-primary">
                How can we help you?
              </h1>
              <p className="text-xl md:text-2xl text-text-light-secondary dark:text-text-dark-secondary max-w-3xl mx-auto leading-relaxed">
                Find answers, tutorials, and step-by-step guides to make the most of BioForge
              </p>
            </div>

            {/* Search Box - Properly spaced */}
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 text-text-light-secondary dark:text-text-dark-secondary w-5 h-5 z-10" />
                <Input
                  type="search"
                  placeholder="Search documentation, guides, and FAQs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-lg py-7 pl-14 pr-6 input-scientific shadow-xl"
                />
              </div>
            </div>
          </div>

          {/* Main Content with Tabs - Proper spacing */}
          <Tabs defaultValue="guides" className="w-full space-y-8">
            <div className="flex justify-center">
              <TabsList className="grid grid-cols-3 w-full max-w-xl h-14 bg-background-light-secondary/50 dark:bg-background-dark-secondary/50 backdrop-blur-sm p-1.5 rounded-2xl shadow-lg">
                <TabsTrigger value="guides" className="flex items-center justify-center gap-2.5 text-base rounded-xl data-[state=active]:shadow-md">
                  <Book className="w-5 h-5" />
                  <span className="hidden sm:inline">Documentation</span>
                  <span className="sm:hidden">Docs</span>
                </TabsTrigger>
                <TabsTrigger value="workflow" className="flex items-center justify-center gap-2.5 text-base rounded-xl data-[state=active]:shadow-md">
                  <Workflow className="w-5 h-5" />
                  <span className="hidden sm:inline">Workflows</span>
                  <span className="sm:hidden">Flow</span>
                </TabsTrigger>
                <TabsTrigger value="faq" className="flex items-center justify-center gap-2.5 text-base rounded-xl data-[state=active]:shadow-md">
                  <HelpCircle className="w-5 h-5" />
                  FAQs
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Documentation Tab */}
            <TabsContent value="guides" className="space-y-8 animate-in fade-in-50 duration-500">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {filteredSections.map((section, index) => (
                  <Card
                    key={index}
                    className="card-scientific hover:shadow-glow-purple hover:-translate-y-1 transition-all duration-300 group"
                  >
                    <CardHeader className="border-b border-border-light-default dark:border-border-dark-subtle pb-5">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-primary-500/20 to-primary-600/20 dark:from-primary-500/30 dark:to-primary-600/30 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                          <span className="text-3xl">{section.icon}</span>
                        </div>
                        <CardTitle className="text-lg font-bold text-text-light-primary dark:text-text-dark-primary leading-tight pt-2">
                          {section.title}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-5 px-6 pb-6">
                      <ul className="space-y-3.5">
                        {section.articles.map((article, articleIndex) => (
                          <li key={articleIndex}>
                            <a
                              href={`#${article.title.toLowerCase().replace(/\s+/g, '-')}`}
                              className="group/link flex items-center justify-between gap-2 text-sm text-text-light-secondary dark:text-text-dark-secondary hover:text-primary-500 dark:hover:text-primary-400 transition-all duration-200 py-1.5"
                            >
                              <span className="group-hover/link:translate-x-1 transition-transform duration-200 flex-1">
                                {article.title}
                              </span>
                              {article.badge && (
                                <Badge
                                  variant={article.badge === 'New' ? 'default' : 'secondary'}
                                  className="text-xs px-2 py-0.5 flex-shrink-0"
                                >
                                  {article.badge}
                                </Badge>
                              )}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Workflow Tab */}
            <TabsContent value="workflow" className="space-y-8 animate-in fade-in-50 duration-500">
              <div className="max-w-5xl mx-auto">
                <Card className="card-scientific shadow-2xl">
                  <CardHeader className="border-b border-border-light-default dark:border-border-dark-subtle p-8 bg-gradient-to-r from-primary-500/5 to-primary-600/5 dark:from-primary-500/10 dark:to-primary-600/10">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <Workflow className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-3xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">
                          Complete Workflows
                        </CardTitle>
                        <CardDescription className="text-base text-text-light-secondary dark:text-text-dark-secondary">
                          Step-by-step workflows for common tasks in BioForge
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-8">
                    <Accordion type="single" collapsible className="w-full space-y-4">
                      <AccordionItem value="workflow-1" className="border border-border-light-default dark:border-border-dark-subtle rounded-2xl px-6 overflow-hidden">
                        <AccordionTrigger className="text-xl font-bold py-6 hover:no-underline">
                          <span className="flex items-center gap-3">
                            <span className="text-3xl">🧬</span>
                            Complete Molecular Docking Workflow
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-6">
                          <ol className="space-y-6 mt-2">
                            <li className="flex gap-5 items-start">
                              <span className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg">
                                1
                              </span>
                              <div className="flex-1 pt-1">
                                <h4 className="font-bold text-lg text-text-light-primary dark:text-text-dark-primary mb-2">
                                  Prepare Your Protein
                                </h4>
                                <p className="text-base text-text-light-secondary dark:text-text-dark-secondary leading-relaxed">
                                  Upload PDB file, remove water molecules, add hydrogens, and extract ligand
                                </p>
                              </div>
                            </li>
                            <li className="flex gap-5 items-start">
                              <span className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg">
                                2
                              </span>
                              <div className="flex-1 pt-1">
                                <h4 className="font-bold text-lg text-text-light-primary dark:text-text-dark-primary mb-2">
                                  Select Ligands
                                </h4>
                                <p className="text-base text-text-light-secondary dark:text-text-dark-secondary leading-relaxed">
                                  Search PubChem database or upload your own ligand library
                                </p>
                              </div>
                            </li>
                            <li className="flex gap-5 items-start">
                              <span className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg">
                                3
                              </span>
                              <div className="flex-1 pt-1">
                                <h4 className="font-bold text-lg text-text-light-primary dark:text-text-dark-primary mb-2">
                                  Configure Docking Parameters
                                </h4>
                                <p className="text-base text-text-light-secondary dark:text-text-dark-secondary leading-relaxed">
                                  Set binding site coordinates, exhaustiveness, and scoring function
                                </p>
                              </div>
                            </li>
                            <li className="flex gap-5 items-start">
                              <span className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg">
                                4
                              </span>
                              <div className="flex-1 pt-1">
                                <h4 className="font-bold text-lg text-text-light-primary dark:text-text-dark-primary mb-2">
                                  Run Docking Simulation
                                </h4>
                                <p className="text-base text-text-light-secondary dark:text-text-dark-secondary leading-relaxed">
                                  Submit job and monitor progress in real-time
                                </p>
                              </div>
                            </li>
                            <li className="flex gap-5 items-start">
                              <span className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg">
                                5
                              </span>
                              <div className="flex-1 pt-1">
                                <h4 className="font-bold text-lg text-text-light-primary dark:text-text-dark-primary mb-2">
                                  Analyze Results
                                </h4>
                                <p className="text-base text-text-light-secondary dark:text-text-dark-secondary leading-relaxed">
                                  View 3D structures, binding scores, and interaction analysis
                                </p>
                              </div>
                            </li>
                          </ol>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="workflow-2" className="border border-border-light-default dark:border-border-dark-subtle rounded-2xl px-6 overflow-hidden">
                        <AccordionTrigger className="text-xl font-bold py-6 hover:no-underline">
                          <span className="flex items-center gap-3">
                            <span className="text-3xl">🎯</span>
                            Protein Preparation with Known Binding Site
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-6">
                          <ol className="space-y-6 mt-2">
                            <li className="flex gap-5 items-start">
                              <span className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg">
                                1
                              </span>
                              <div className="flex-1 pt-1">
                                <h4 className="font-bold text-lg text-text-light-primary dark:text-text-dark-primary mb-2">
                                  Upload Protein Structure
                                </h4>
                                <p className="text-base text-text-light-secondary dark:text-text-dark-secondary leading-relaxed">
                                  Go to Protein Preparation → Known Binding Site tab
                                </p>
                              </div>
                            </li>
                            <li className="flex gap-5 items-start">
                              <span className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg">
                                2
                              </span>
                              <div className="flex-1 pt-1">
                                <h4 className="font-bold text-lg text-text-light-primary dark:text-text-dark-primary mb-2">
                                  Specify Ligand Residue
                                </h4>
                                <p className="text-base text-text-light-secondary dark:text-text-dark-secondary leading-relaxed">
                                  Enter 3-letter residue name (e.g., KAA, ATP, NAD)
                                </p>
                              </div>
                            </li>
                            <li className="flex gap-5 items-start">
                              <span className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg">
                                3
                              </span>
                              <div className="flex-1 pt-1">
                                <h4 className="font-bold text-lg text-text-light-primary dark:text-text-dark-primary mb-2">
                                  Process & Download
                                </h4>
                                <p className="text-base text-text-light-secondary dark:text-text-dark-secondary leading-relaxed">
                                  Get cleaned PDB, extracted ligand, and PDBQT files
                                </p>
                              </div>
                            </li>
                          </ol>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="workflow-3" className="border border-border-light-default dark:border-border-dark-subtle rounded-2xl px-6 overflow-hidden">
                        <AccordionTrigger className="text-xl font-bold py-6 hover:no-underline">
                          <span className="flex items-center gap-3">
                            <span className="text-3xl">🔍</span>
                            Predict Binding Sites with P2Rank
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-6">
                          <ol className="space-y-6 mt-2">
                            <li className="flex gap-5 items-start">
                              <span className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg">
                                1
                              </span>
                              <div className="flex-1 pt-1">
                                <h4 className="font-bold text-lg text-text-light-primary dark:text-text-dark-primary mb-2">
                                  Upload Protein
                                </h4>
                                <p className="text-base text-text-light-secondary dark:text-text-dark-secondary leading-relaxed">
                                  Go to Protein Preparation → Predict Binding Site tab
                                </p>
                              </div>
                            </li>
                            <li className="flex gap-5 items-start">
                              <span className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg">
                                2
                              </span>
                              <div className="flex-1 pt-1">
                                <h4 className="font-bold text-lg text-text-light-primary dark:text-text-dark-primary mb-2">
                                  AI Prediction
                                </h4>
                                <p className="text-base text-text-light-secondary dark:text-text-dark-secondary leading-relaxed">
                                  P2Rank automatically predicts and ranks binding sites
                                </p>
                              </div>
                            </li>
                            <li className="flex gap-5 items-start">
                              <span className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg">
                                3
                              </span>
                              <div className="flex-1 pt-1">
                                <h4 className="font-bold text-lg text-text-light-primary dark:text-text-dark-primary mb-2">
                                  Review Results
                                </h4>
                                <p className="text-base text-text-light-secondary dark:text-text-dark-secondary leading-relaxed">
                                  View predicted sites with scores and download detailed reports
                                </p>
                              </div>
                            </li>
                          </ol>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* FAQ Tab */}
            <TabsContent value="faq" className="space-y-8 animate-in fade-in-50 duration-500">
              <div className="max-w-4xl mx-auto">
                <Card className="card-scientific shadow-2xl">
                  <CardHeader className="border-b border-border-light-default dark:border-border-dark-subtle p-8 bg-gradient-to-r from-primary-500/5 to-primary-600/5 dark:from-primary-500/10 dark:to-primary-600/10">
                    <CardTitle className="text-3xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">
                      Frequently Asked Questions
                    </CardTitle>
                    <CardDescription className="text-base text-text-light-secondary dark:text-text-dark-secondary">
                      Quick answers to common questions about BioForge
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-8">
                    <Accordion type="single" collapsible className="w-full space-y-3">
                      {faqs.map((faq, index) => (
                        <AccordionItem
                          key={index}
                          value={`faq-${index}`}
                          className="border border-border-light-default dark:border-border-dark-subtle rounded-xl px-6 overflow-hidden hover:border-primary-500/50 transition-colors"
                        >
                          <AccordionTrigger className="text-left text-lg font-semibold py-5 hover:no-underline text-text-light-primary dark:text-text-dark-primary">
                            {faq.question}
                          </AccordionTrigger>
                          <AccordionContent className="text-base text-text-light-secondary dark:text-text-dark-secondary pb-5 leading-relaxed">
                            {faq.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>

          {/* Contact Support Section - Well spaced */}
          <div className="max-w-4xl mx-auto">
            <Card className="card-scientific bg-gradient-to-br from-primary-500/10 via-primary-600/5 to-primary-700/10 dark:from-primary-500/20 dark:via-primary-600/10 dark:to-primary-700/20 border-2 border-primary-500/30 dark:border-primary-500/40 shadow-2xl">
              <CardContent className="text-center p-12 space-y-8">
                <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-primary-500 to-primary-600 rounded-3xl shadow-glow-purple">
                  <MessageSquare className="w-12 h-12 text-white" />
                </div>

                <div className="space-y-4">
                  <h2 className="text-4xl font-bold text-text-light-primary dark:text-text-dark-primary">
                    Still need help?
                  </h2>
                  <p className="text-lg text-text-light-secondary dark:text-text-dark-secondary max-w-2xl mx-auto leading-relaxed">
                    Our support team is here to assist you with any questions or issues.
                    Get in touch and we'll respond as soon as possible.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                  <a
                    href="mailto:support@bioforge.com"
                    className="btn-primary inline-flex items-center justify-center gap-3 text-lg px-8 py-4"
                  >
                    <Mail className="w-5 h-5" />
                    Email Support
                  </a>
                  <a
                    href="/chatbot"
                    className="btn-secondary inline-flex items-center justify-center gap-3 text-lg px-8 py-4"
                  >
                    <MessageSquare className="w-5 h-5" />
                    Chat with AI Assistant
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default Help;
