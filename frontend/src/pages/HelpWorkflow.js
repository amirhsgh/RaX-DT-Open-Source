import React, { useState } from 'react';
import { Card } from '../components/UI/Card';
import Steps, { Step } from '../components/UI/steps';
import { Collapse, CollapseTrigger, CollapseContent } from '../components/UI/collapse';
import { Title, Paragraph, Text } from '../components/UI/typography';
import Divider from '../components/UI/divider';
import { Tag } from '../components/UI/Badge';
import Space from '../components/UI/space';
import { Alert, AlertDescription, AlertTitle } from '../components/UI/Alert';
import { Timeline } from '../components/UI/timeline';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/UI/tabs';
import { Row, Col } from '../components/UI/grid';
import { Button } from '../components/UI/Button';
import Descriptions from '../components/UI/descriptions';
import {
  FlaskConical as ExperimentOutlined,
  Database as DatabaseOutlined,
  CloudDownload as CloudDownloadOutlined,
  FileText as FileTextOutlined,
  Rocket as RocketOutlined,
  CheckCircle as CheckCircleOutlined,
  ArrowRight as ArrowRightOutlined,
  Info as InfoCircleOutlined,
  AlertTriangle as WarningOutlined,
  Zap as ThunderboltOutlined,
  Search as FileSearchOutlined
} from 'lucide-react';


const HelpWorkflow = () => {
  const [activeTab, setActiveTab] = useState('overview');

  // Workflow steps data
  const workflowSteps = [
    {
      title: 'Download Protein',
      description: 'Get your protein structure from PDB Database',
      icon: <DatabaseOutlined />,
      details: [
        'Go to "PDB Database" tab',
        'Search for your protein (e.g., "insulin", "hemoglobin")',
        'Select the best structure based on quality score',
        'Click Download and choose PDB format (3D structure)',
        'Save the file to your computer'
      ],
      tips: [
        'Higher quality score = better structure',
        'Lower resolution (Å) = higher quality',
        'Check organism to match your research',
        'X-RAY structures usually have best resolution'
      ]
    },
    {
      title: 'Prepare Protein',
      description: 'Process protein for docking simulation',
      icon: <ExperimentOutlined />,
      details: [
        'Go to "Protein Preparation" tab',
        'Upload your PDB file from step 1',
        'Enter ligand residue name (e.g., "HEM", "ADP") - this is the co-crystallized ligand',
        'Click "Prepare Protein" button',
        'Wait for processing to complete',
        'Download the prepared protein (PDBQT format)'
      ],
      tips: [
        'Ligand residue name can be found in PDB file',
        'Preparation adds hydrogens and charges',
        'PDBQT format is required for docking',
        'Keep the downloaded file - you\'ll need it in step 4'
      ]
    },
    {
      title: 'Start Docking',
      description: 'Create a new docking job',
      icon: <RocketOutlined />,
      details: [
        'Go to "Projects" tab',
        'Click "Create New Project" button',
        'Enter project name and description',
        'Upload prepared protein (PDBQT from step 2)',
        'Upload ligands (SDF format from PubChem or your files)',
        'Configure docking parameters',
        'Submit the job'
      ],
      tips: [
        'You can upload multiple ligands at once',
        'SDF files can be downloaded from PubChem tab',
        'Use AutoBox for automatic binding site detection',
        'Manual box requires center coordinates (X, Y, Z) and size'
      ]
    },
    {
      title: '3D Visualization',
      description: 'View and analyze results',
      icon: <FileSearchOutlined />,
      details: [
        'Wait for docking job to complete',
        'Go to "Visualization" tab',
        'Select your project from the list',
        'View ligand rankings by docking score',
        'Click on a ligand to view 3D structure',
        'Analyze protein-ligand interactions',
        'Download results (PDBQT or SDF format)'
      ],
      tips: [
        'Lower (more negative) scores = stronger binding',
        'Check hydrogen bonds and hydrophobic interactions',
        'Compare multiple ligands side by side',
        'Export visualizations for presentations'
      ]
    },
    {
      title: 'Go to PDB & Download Protein',
      description: 'Fetch protein and download for docking',
      icon: <CloudDownloadOutlined />,
      details: [
        'Navigate to PDB Database tab',
        'Search by protein name or PDB ID',
        'Review structure details (organism, mutations, chains)',
        'Download in PDB format for 3D structure'
      ]
    }
  ];

  // Glossary
  const glossary = [
    {
      term: 'Protein',
      definition: 'A biological macromolecule that serves as the target for drug binding. The protein structure determines where and how drugs can bind.'
    },
    {
      term: 'Ligand',
      definition: 'A small molecule (potential drug) that binds to the protein. You can get ligands from PubChem or upload your own SDF files.'
    },
    {
      term: 'PDB (Protein Data Bank)',
      definition: 'A database containing 3D structures of proteins determined by X-ray crystallography, NMR, or Cryo-EM. Format: .pdb file'
    },
    {
      term: 'PDBQT',
      definition: 'PDB format with partial charges (Q) and atom types (T). Required for docking simulations. Created during protein preparation.'
    },
    {
      term: 'SDF (Structure Data File)',
      definition: 'A chemical file format containing 2D or 3D molecular structures. Used for ligands. Can be downloaded from PubChem.'
    },
    {
      term: 'Docking Score',
      definition: 'A numerical value (kcal/mol) estimating binding strength. Lower (more negative) = stronger binding. Example: -8.5 is better than -6.2'
    },
    {
      term: 'Binding Site',
      definition: 'The specific region on the protein where the ligand binds. Can be detected automatically (AutoBox) or specified manually.'
    },
    {
      term: 'AutoBox',
      definition: 'Automatic detection of binding site using the co-crystallized ligand as reference. Recommended for beginners.'
    },
    {
      term: 'Manual Box',
      definition: 'Specify binding site coordinates manually. Requires center (X, Y, Z) and box size. For advanced users.'
    },
    {
      term: 'Quality Score',
      definition: 'Rating (0-100) for PDB structures based on resolution, R-factor, and experimental method. Higher = better quality.'
    },
    {
      term: 'Resolution (Å)',
      definition: 'Measure of structure quality in Ångströms. Lower = better. <2.0Å is high quality, 2.0-3.0Å is good, >3.0Å is moderate.'
    },
    {
      term: 'Organism',
      definition: 'The species from which the protein was obtained (e.g., Homo sapiens, E. coli). Important for research relevance.'
    },
    {
      term: 'Chains',
      definition: 'Individual protein subunits in the structure. Some proteins have multiple chains (e.g., hemoglobin has 4 chains: A, B, C, D).'
    },
    {
      term: 'Mutations',
      definition: 'Amino acid changes in the protein sequence. Can affect drug binding and protein function.'
    }
  ];

  // File format guide
  const fileFormats = [
    {
      format: 'PDB',
      extension: '.pdb',
      use: 'Download from PDB Database',
      description: '3D protein structure file. Contains atomic coordinates.',
      where: 'Step 1: Downloaded from PDB Database tab'
    },
    {
      format: 'PDBQT',
      extension: '.pdbqt',
      use: 'Prepared protein for docking',
      description: 'PDB with partial charges and atom types. Required for docking.',
      where: 'Step 2: Output of Protein Preparation tab'
    },
    {
      format: 'SDF',
      extension: '.sdf',
      use: 'Ligand structures',
      description: 'Chemical structure file for small molecules (ligands).',
      where: 'Step 3: Downloaded from PubChem or your own files'
    },
    {
      format: 'CIF/mmCIF',
      extension: '.cif',
      use: 'Alternative protein format',
      description: 'Crystallographic Information File. Alternative to PDB.',
      where: 'Optional: Can download from PDB Database'
    }
  ];

  const tabItems = [
    {
      key: 'overview',
      label: (
        <span className="flex items-center gap-2">
          <RocketOutlined />
          <span>Overview</span>
        </span>
      ),
      children: (
        <div className="space-y-8">
          {/* Main Workflow Diagram */}
          <Card className="border border-primary/20 bg-gradient-to-br from-primary/5 via-blue-50 to-purple-50 dark:from-primary/15 dark:via-blue-950/40 dark:to-purple-950/30">
            <div className="text-center space-y-2 mb-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1 text-sm font-semibold text-primary">
                <ThunderboltOutlined className="h-4 w-4" />
                Complete Workflow
              </div>
              <Title level={3} className="mb-1">
                Complete Workflow: 4 Simple Steps
              </Title>
              <Paragraph className="max-w-2xl mx-auto text-muted-foreground">
                Follow these four phases to take a protein from discovery to insightful docking analysis.
              </Paragraph>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {workflowSteps.slice(0, 4).map((step, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 rounded-xl border border-border bg-background/80 p-5 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary text-xl">
                    {step.icon}
                  </div>
                  <div className="space-y-2">
                    <Text strong className="text-lg">
                      {step.title}
                    </Text>
                    <Paragraph type="secondary" className="text-sm">
                      {step.description}
                    </Paragraph>
                    {step.details && (
                      <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
                        {step.details.slice(0, 3).map((detail, detailIndex) => (
                          <li key={detailIndex}>{detail}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Alert
              message="💡 Pro Tip"
              description="Follow these 4 steps in order. Each step prepares data for the next step. Don't skip any steps!"
              type="info"
              showIcon
              className="mt-8"
            />
          </Card>

          {/* Quick Start */}
          <Card className="border border-border shadow-sm">
            <Title level={4} className="mb-6 flex items-center gap-2">
              🚀 Quick Start Guide
            </Title>
            <Timeline className="space-y-6">
              <Timeline.Item color="blue" dot="1">
                <div className="space-y-1">
                  <Text strong>Step 1: Get Protein (5 min)</Text>
                  <Paragraph type="secondary" className="text-sm">
                    PDB Database → Search → Download PDB file
                  </Paragraph>
                </div>
              </Timeline.Item>
              <Timeline.Item color="green" dot="2">
                <div className="space-y-1">
                  <Text strong>Step 2: Prepare Protein (2-5 min)</Text>
                  <Paragraph type="secondary" className="text-sm">
                    Protein Preparation → Upload PDB → Get PDBQT
                  </Paragraph>
                </div>
              </Timeline.Item>
              <Timeline.Item color="orange" dot="3">
                <div className="space-y-1">
                  <Text strong>Step 3: Create Docking Job (3 min)</Text>
                  <Paragraph type="secondary" className="text-sm">
                    Projects → New Project → Upload files → Submit
                  </Paragraph>
                </div>
              </Timeline.Item>
              <Timeline.Item color="purple" dot="4">
                <div className="space-y-1">
                  <Text strong>Step 4: View Results (Variable time)</Text>
                  <Paragraph type="secondary" className="text-sm">
                    Visualization → Select project → Analyze binding
                  </Paragraph>
                </div>
              </Timeline.Item>
            </Timeline>
          </Card>
        </div>
      )
    },
    {
      key: 'step1',
      label: 'Step 1: Download Protein',
      children: (
        <Card className="space-y-6 p-6">
          <div className="space-y-2">
            <Title level={4} className="flex items-center gap-2">
              <DatabaseOutlined className="text-blue-500" />
              Download Protein from PDB Database
            </Title>
            <Paragraph className="text-muted-foreground leading-relaxed">
              The first step is to obtain a 3D protein structure from the Protein Data Bank.
            </Paragraph>
          </div>

          <Alert
            message="What You'll Do"
            description="Navigate to PDB Database tab, search for your protein, and download a high-quality structure file."
            type="info"
            showIcon
          />

          <Divider>Detailed Instructions</Divider>

          <Timeline className="space-y-5">
            <Timeline.Item color="blue" dot="1">
              <div className="space-y-1">
                <Text strong>Click on "PDB Database" tab</Text>
                <Paragraph type="secondary" className="text-sm">
                  Located in the main navigation menu
                </Paragraph>
              </div>
            </Timeline.Item>

            <Timeline.Item color="blue" dot="2">
              <div className="space-y-2">
                <Text strong>Search for your protein</Text>
                <Paragraph type="secondary" className="text-sm">
                  Enter protein name (e.g., "insulin", "hemoglobin", "lysozyme")
                </Paragraph>
                <Tag color="blue">Tip: Use common names, not complex chemical names</Tag>
              </div>
            </Timeline.Item>

            <Timeline.Item color="blue" dot="3">
              <div className="space-y-2">
                <Text strong>Review search results</Text>
                <Paragraph type="secondary" className="text-sm">
                  Focus on these columns:
                </Paragraph>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc pl-5">
                  <li><Text strong>Quality Score:</Text> Higher is better (aim for 70+)</li>
                  <li><Text strong>Resolution:</Text> Lower is better (aim for &lt;2.5Å)</li>
                  <li><Text strong>Organism:</Text> Should match your research</li>
                  <li><Text strong>Method:</Text> X-RAY usually offers best quality</li>
                </ul>
              </div>
            </Timeline.Item>

            <Timeline.Item color="blue" dot="4">
              <div className="space-y-1">
                <Text strong>Click the “Download” button</Text>
                <Paragraph type="secondary" className="text-sm">
                  Choose the structure that best fits your needs
                </Paragraph>
              </div>
            </Timeline.Item>

            <Timeline.Item color="green" dot={<CheckCircleOutlined className="h-4 w-4" />}>
              <div className="space-y-2">
                <Text strong>Choose PDB format</Text>
                <Tag color="green">PDB Format - 3D Structure (Recommended)</Tag>
                <Paragraph type="secondary" className="text-sm">
                  The file will be saved as <code>XXXX.pdb</code> (e.g., 4HHB.pdb)
                </Paragraph>
              </div>
            </Timeline.Item>
          </Timeline>

          <Alert
            message="⚠️ Important"
            description="Remember where you saved the PDB file - you'll need it in Step 2!"
            type="warning"
            showIcon
          />

          <Card type="inner" title="📊 Understanding Quality Metrics" className="mt-6">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Quality Score">
                0-100 rating. Higher = better. Based on resolution, R-factor, experimental method.
              </Descriptions.Item>
              <Descriptions.Item label="Resolution (Å)">
                Measure of detail. &lt;1.5Å = Excellent, 1.5-2.5Å = Good, 2.5-3.5Å = Moderate, &gt;3.5Å = Low
              </Descriptions.Item>
              <Descriptions.Item label="R-factor">
                Quality metric for X-ray structures. Lower = better. Good: &lt;0.20
              </Descriptions.Item>
              <Descriptions.Item label="Organism">
                Species source. Example: "Homo sapiens" for human proteins
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Card>
      )
    },
    {
      key: 'step2',
      label: 'Step 2: Prepare Protein',
      children: (
        <Card className="space-y-6 p-6">
          <div className="space-y-6">
            <div>
              <Title level={4}>
                <ExperimentOutlined className="text-green-500 mr-2" />
                Prepare Protein for Docking
              </Title>
              <Paragraph>
                Raw PDB files need processing before docking. This step adds hydrogens, assigns charges, and creates PDBQT format.
              </Paragraph>
            </div>

            <Alert
              message="What You'll Do"
              description="Upload your PDB file from Step 1 and convert it to PDBQT format ready for docking."
              type="info"
              showIcon
            />

            <Divider>Detailed Instructions</Divider>

            <Timeline className="space-y-5">
              <Timeline.Item color="green" dot="1">
                <Text strong>Click on "Protein Preparation" tab</Text>
              </Timeline.Item>

              <Timeline.Item color="green" dot="2">
                <div className="space-y-1">
                  <Text strong>Upload your PDB file</Text>
                  <Paragraph type="secondary" className="text-sm">
                    Click "Choose File" or drag & drop the .pdb file from Step 1
                  </Paragraph>
                </div>
              </Timeline.Item>

              <Timeline.Item color="green" dot="3">
                <Text strong>Enter Ligand Residue Name</Text>
                <br />
                <Card type="inner" className="mt-2" size="small">
                  <Text strong>What is this?</Text>
                  <Paragraph className="mb-2">
                    Many PDB structures contain a co-crystallized ligand (a small molecule that was bound to the protein when the structure was determined).
                    The residue name is a 3-letter code identifying this ligand.
                  </Paragraph>
                  <Text strong>How to find it?</Text>
                  <ul className="ml-4">
                    <li>Check the PDB Database details page</li>
                    <li>Common examples: HEM (heme), ATP (adenosine triphosphate), NAD, ADP, GDP</li>
                    <li>Open PDB file in text editor and look for "HETATM" lines</li>
                  </ul>
                  <Tag color="orange" className="mt-2">Example: HEM, ATP, NAD, ADP, GLC</Tag>
                </Card>
              </Timeline.Item>

              <Timeline.Item color="green" dot="4">
                <div className="space-y-1">
                  <Text strong>Click "Prepare Protein"</Text>
                  <Paragraph type="secondary" className="text-sm">
                    Processing typically takes 2-5 minutes
                  </Paragraph>
                </div>
              </Timeline.Item>

              <Timeline.Item color="blue" dot={<InfoCircleOutlined className="h-4 w-4" />}>
                <div className="space-y-2">
                  <Text strong>Wait for processing</Text>
                  <Paragraph type="secondary" className="text-sm">The system will:</Paragraph>
                  <ul className="mt-2 ml-4 space-y-1 text-sm text-muted-foreground">
                    <li>Add hydrogen atoms</li>
                    <li>Assign partial charges</li>
                    <li>Detect binding site (where ligand binds)</li>
                    <li>Convert to PDBQT format</li>
                  </ul>
                </div>
              </Timeline.Item>

              <Timeline.Item color="green" dot={<CheckCircleOutlined className="h-4 w-4" />}>
                <div className="space-y-2">
                  <Text strong>Download prepared protein</Text>
                  <Tag color="green">File: prepared_protein.pdbqt</Tag>
                  <Paragraph type="secondary" className="text-sm">
                    This PDBQT file is ready for docking in Step 3!
                  </Paragraph>
                </div>
              </Timeline.Item>
            </Timeline>

            <Alert
              message="💡 What Happened?"
              description={
                <div>
                  <p><strong>Hydrogens Added:</strong> Essential for accurate docking calculations</p>
                  <p><strong>Charges Assigned:</strong> Partial charges for electrostatic interactions</p>
                  <p><strong>Binding Site Detected:</strong> Location where drugs can bind</p>
                  <p><strong>PDBQT Created:</strong> Format compatible with docking software</p>
                </div>
              }
              type="success"
              showIcon
            />
          </div>
        </Card>
      )
    },
    {
      key: 'step3',
      label: 'Step 3: Start Docking',
      children: (
        <Card className="space-y-6 p-6">
          <div className="space-y-6">
            <div>
              <Title level={4}>
                <RocketOutlined className="text-orange-500 mr-2" />
                Create Docking Job
              </Title>
              <Paragraph>
                Now you'll create a project, upload files, and configure docking parameters to run your simulation.
              </Paragraph>
            </div>

            <Alert
              message="What You'll Need"
              description={
                <ul className="ml-4">
                  <li>✅ Prepared protein (PDBQT file from Step 2)</li>
                  <li>✅ Ligand files (SDF format - download from PubChem tab or use your own)</li>
                </ul>
              }
              type="info"
              showIcon
            />

            <Divider>Detailed Instructions</Divider>

            <Timeline className="space-y-5">
              <Timeline.Item color="orange" dot="1">
                <Text strong>Click on "Projects" tab</Text>
              </Timeline.Item>

              <Timeline.Item color="orange" dot="2">
                <Text strong>Click "Create New Project" button</Text>
              </Timeline.Item>

              <Timeline.Item color="orange" dot="3">
                <div className="space-y-2">
                  <Text strong>Fill in project details</Text>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2"><Tag color="blue">Project Name</Tag><Text type="secondary">Give it a descriptive name (e.g., "Insulin_Screening")</Text></div>
                    <div className="flex items-center gap-2"><Tag color="blue">Description</Tag><Text type="secondary">Optional notes about your project</Text></div>
                  </div>
                </div>
              </Timeline.Item>

              <Timeline.Item color="orange" dot="4">
                <div className="space-y-1">
                  <Text strong>Upload Prepared Protein</Text>
                  <Text type="secondary" className="text-sm">Use the PDBQT file generated in Step 2</Text>
                  <Tag color="green">File: prepared_protein.pdbqt</Tag>
                </div>
              </Timeline.Item>

              <Timeline.Item color="orange" dot="5">
                <div className="space-y-2">
                  <Text strong>Upload Ligands (SDF files)</Text>
                  <Card type="inner" size="small" className="mt-2 space-y-3">
                    <div>
                      <Text strong className="text-blue-500">Option 1: PubChem (Recommended)</Text>
                      <ul className="ml-4 space-y-1 text-sm text-muted-foreground">
                        <li>Go to "PubChem" tab</li>
                        <li>Search for compounds by name or SMILES</li>
                        <li>Click "Download SDF" on each compound</li>
                        <li>You can download multiple compounds</li>
                      </ul>
                    </div>
                    <div>
                      <Text strong className="text-green-500">Option 2: Your Own Files</Text>
                      <ul className="ml-4 space-y-1 text-sm text-muted-foreground">
                        <li>Upload your own SDF files</li>
                        <li>Must be in SDF format</li>
                        <li>Can upload multiple files at once</li>
                      </ul>
                    </div>
                  </Card>
                </div>
              </Timeline.Item>

              <Timeline.Item color="orange" dot="6">
                <Text strong>Configure Docking Box</Text>
                <Card type="inner" size="small" className="mt-2">
                  <Row gutter={16}>
                    <Col span={12}>
                      <Tag color="green">AutoBox (Recommended)</Tag>
                      <Paragraph className="mt-2">
                        <Text strong>What it does:</Text> Automatically detects binding site using the ligand from Step 2
                      </Paragraph>
                      <Paragraph>
                        <Text strong>Best for:</Text> Beginners, structures with co-crystallized ligands
                      </Paragraph>
                      <Paragraph>
                        <Text type="success">✅ Just upload SDF file from Step 2 and Done! Auto Box will detect the binding site and create the docking box for you. no coordinates needed!</Text>
                      </Paragraph>
                    </Col>
                    <Col span={12}>
                      <Tag color="orange">Manual Box (Advanced)</Tag>
                      <Paragraph className="mt-2">
                        <Text strong>What it does:</Text> You specify binding site coordinates manually
                      </Paragraph>
                      <Paragraph>
                        <Text strong>Requires:</Text>
                        <ul className="ml-4">
                          <li>Center X, Y, Z coordinates</li>
                          <li>Box Size X, Y, Z (typically 20-30Å)</li>
                        </ul>
                      </Paragraph>
                      <Paragraph>
                        <Text strong>Best for:</Text> Advanced users, specific binding sites
                      </Paragraph>
                    </Col>
                  </Row>
                </Card>
              </Timeline.Item>

              <Timeline.Item color="green" dot={<CheckCircleOutlined className="h-4 w-4" />}>
                <Text strong>Click "Submit Job"</Text>
                <Paragraph type="secondary" className="text-sm">Your docking simulation will start!</Paragraph>
                <Tag color="blue" className="mt-2">Processing time: 10 minutes to several hours (depends on number of ligands)</Tag>
              </Timeline.Item>
            </Timeline>

            <Alert
              message="⏱️ What Happens Next?"
              description={
                <div>
                  <p>Your job is now in the queue. The system will:</p>
                  <ul className="ml-4">
                    <li>Process each ligand against the protein</li>
                    <li>Calculate binding poses and scores</li>
                    <li>Rank ligands by binding affinity</li>
                    <li>Generate 3D visualization data</li>
                  </ul>
                  <p className="mt-2">You can monitor progress in the Projects tab or proceed to Step 4 when complete.</p>
                </div>
              }
              type="info"
              showIcon
            />
          </div>
        </Card>
      )
    },
    {
      key: 'step4',
      label: 'Step 4: View Results',
      children: (
        <Card>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Title level={4}>
                <FileSearchOutlined className="text-purple-500 mr-2" />
                3D Visualization & Analysis
              </Title>
              <Paragraph>
                Once docking completes, view and analyze your results in interactive 3D visualization.
              </Paragraph>
            </div>

            <Alert
              message="When Can I View Results?"
              description="Wait for your job status to show 'Completed' in the Projects tab. You'll receive a notification when ready."
              type="info"
              showIcon
            />

            <Divider>Detailed Instructions</Divider>

            <Timeline>
              <Timeline.Item color="purple" dot={<span>1</span>}>
                <Text strong>Click on "Visualization" tab</Text>
              </Timeline.Item>

              <Timeline.Item color="purple" dot={<span>2</span>}>
                <Text strong>Select your project</Text>
                <br />
                <Text type="secondary">Choose from the list of completed projects</Text>
              </Timeline.Item>

              <Timeline.Item color="purple" dot={<span>3</span>}>
                <Text strong>Review ligand rankings</Text>
                <br />
                <Card type="inner" size="small" className="mt-2">
                  <Text strong>Understanding Docking Scores:</Text>
                  <Descriptions bordered column={1} size="small" className="mt-2">
                    <Descriptions.Item label="Score Unit">
                      kcal/mol (kilocalories per mole)
                    </Descriptions.Item>
                    <Descriptions.Item label="Better Score">
                      More negative = Stronger binding
                    </Descriptions.Item>
                    <Descriptions.Item label="Example">
                      -8.5 is better than -6.2
                    </Descriptions.Item>
                    <Descriptions.Item label="Good Range">
                      -7.0 to -10.0 kcal/mol (drug-like binding)
                    </Descriptions.Item>
                    <Descriptions.Item label="Excellent">
                      Below -10.0 kcal/mol (very strong binding)
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Timeline.Item>

              <Timeline.Item color="purple" dot={<span>4</span>}>
                <Text strong>Click on a ligand to view 3D structure</Text>
                <br />
                <Text type="secondary">Interactive NGL viewer will show:</Text>
                <ul className="mt-2 ml-4">
                  <li>Protein structure (cartoon/surface)</li>
                  <li>Ligand binding pose (ball-and-stick)</li>
                  <li>Binding site residues</li>
                  <li>Interactions (hydrogen bonds, hydrophobic contacts)</li>
                </ul>
              </Timeline.Item>

              <Timeline.Item color="purple" dot={<span>5</span>}>
                <Text strong>Analyze interactions</Text>
                <br />
                <Text type="secondary">Look for:</Text>
                <ul className="mt-2 ml-4">
                  <li><Tag color="cyan">Hydrogen Bonds</Tag> - Key for strong binding</li>
                  <li><Tag color="orange">Hydrophobic Interactions</Tag> - Stability</li>
                  <li><Tag color="green">Salt Bridges</Tag> - Electrostatic interactions</li>
                  <li><Tag color="purple">Pi-Pi Stacking</Tag> - Aromatic interactions</li>
                </ul>
              </Timeline.Item>

              <Timeline.Item color="green" dot={<CheckCircleOutlined />}>
                <Text strong>Download results</Text>
                <br />
                <div className="mt-2 space-y-2">
                  <div>
                    <Tag color="blue">Download Pose</Tag>
                    <Text type="secondary"> Download ligand structure (PDBQT/SDF)</Text>
                  </div>
                  <div>
                    <Tag color="green">Download Report</Tag>
                    <Text type="secondary"> Get detailed analysis report</Text>
                  </div>
                  <div>
                    <Tag color="purple">Export Image</Tag>
                    <Text type="secondary"> Save visualization for presentations</Text>
                  </div>
                </div>
              </Timeline.Item>
            </Timeline>

            <Alert
              message="📊 Interpreting Results"
              description={
                <div>
                  <p><strong>Top Ligands:</strong> Focus on ligands with lowest (most negative) scores</p>
                  <p><strong>Interactions:</strong> More hydrogen bonds usually = better binding</p>
                  <p><strong>Binding Mode:</strong> Check if ligand fits well in the binding pocket</p>
                  <p><strong>Validation:</strong> Compare with known drug structures if available</p>
                </div>
              }
              type="success"
              showIcon
            />
          </Space>
        </Card>
      )
    },
    {
      key: 'glossary',
      label: 'Glossary',
      children: (
        <Card>
          <Title level={4}>📖 Terms & Definitions</Title>
          <Paragraph>
            Common terms used in molecular docking and this platform.
          </Paragraph>

          <Collapse
            accordion
            items={glossary.map((item, index) => ({
              key: index,
              label: <Text strong>{item.term}</Text>,
              children: <Paragraph>{item.definition}</Paragraph>
            }))}
          />
        </Card>
      )
    },
    {
      key: 'formats',
      label: 'File Formats',
      children: (
        <Card>
          <Title level={4}>📁 File Format Guide</Title>
          <Paragraph>
            Understanding different file formats used in the workflow.
          </Paragraph>

          <div className="space-y-4">
            {fileFormats.map((format, index) => (
              <Card key={index} type="inner" size="small">
                <Row gutter={16} align="middle">
                  <Col span={4}>
                    <Tag color="blue" style={{ fontSize: '16px', padding: '8px 16px' }}>
                      {format.format}
                    </Tag>
                  </Col>
                  <Col span={20}>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="Extension">
                        <code>{format.extension}</code>
                      </Descriptions.Item>
                      <Descriptions.Item label="Used For">
                        {format.use}
                      </Descriptions.Item>
                      <Descriptions.Item label="Description">
                        {format.description}
                      </Descriptions.Item>
                      <Descriptions.Item label="Where to Get">
                        <Tag color="green">{format.where}</Tag>
                      </Descriptions.Item>
                    </Descriptions>
                  </Col>
                </Row>
              </Card>
            ))}
          </div>

          <Alert
            message="Quick Reference"
            description={
              <div>
                <p><code>.pdb</code> → Download from PDB Database (Step 1)</p>
                <p><code>.pdbqt</code> → Generated by Protein Preparation (Step 2)</p>
                <p><code>.sdf</code> → Download from PubChem or upload your own (Step 3)</p>
              </div>
            }
            type="info"
            showIcon
            className="mt-4"
          />
        </Card>
      )
    },
    {
      key: 'faq',
      label: 'FAQ',
      children: (
        <Card>
          <Title level={4}>❓ Frequently Asked Questions</Title>

          <Collapse
            accordion
            items={[
              {
                key: '1',
                label: 'What protein should I choose?',
                children: (
                  <div>
                    <Paragraph>
                      Choose based on your research goals:
                    </Paragraph>
                    <ul>
                      <li><strong>Quality:</strong> Higher quality score and lower resolution are better</li>
                      <li><strong>Organism:</strong> Should match your research (e.g., human proteins for drug discovery)</li>
                      <li><strong>Method:</strong> X-RAY structures usually have best quality</li>
                      <li><strong>Mutations:</strong> Check if mutations affect your binding site</li>
                    </ul>
                  </div>
                )
              },
              {
                key: '2',
                label: 'How do I find the ligand residue name?',
                children: (
                  <div>
                    <Paragraph>Three ways to find it:</Paragraph>
                    <ol>
                      <li>Check the PDB Database structure details page - look for "Ligands" section</li>
                      <li>Common examples: HEM (heme), ATP, ADP, NAD, GDP, FAD</li>
                      <li>Open PDB file in text editor and search for "HETATM" - the 3-letter code after residue number is what you need</li>
                    </ol>
                  </div>
                )
              },
              {
                key: '3',
                label: 'Should I use AutoBox or Manual Box?',
                children: (
                  <div>
                    <Paragraph><strong>Use AutoBox if:</strong></Paragraph>
                    <ul>
                      <li>You're a beginner</li>
                      <li>Your protein has a co-crystallized ligand (most PDB structures do)</li>
                      <li>You want the system to automatically detect the binding site</li>
                    </ul>
                    <Paragraph className="mt-3"><strong>Use Manual Box if:</strong></Paragraph>
                    <ul>
                      <li>You're an advanced user</li>
                      <li>You know exact binding site coordinates</li>
                      <li>You want to target a specific region different from the co-crystallized ligand</li>
                    </ul>
                  </div>
                )
              },
              {
                key: '4',
                label: 'How long does docking take?',
                children: (
                  <div>
                    <Paragraph>Depends on several factors:</Paragraph>
                    <ul>
                      <li><strong>Number of ligands:</strong> 1-10 ligands: ~10-30 minutes</li>
                      <li><strong>Protein size:</strong> Larger proteins take longer</li>
                      <li><strong>System load:</strong> May queue if many jobs running</li>
                      <li><strong>Typical:</strong> 30 minutes to 2 hours for most jobs</li>
                    </ul>
                  </div>
                )
              },
              {
                key: '5',
                label: 'What is a good docking score?',
                children: (
                  <div>
                    <Descriptions bordered column={1} size="small">
                      <Descriptions.Item label="Excellent Binding">
                        &lt; -10.0 kcal/mol
                      </Descriptions.Item>
                      <Descriptions.Item label="Good Binding">
                        -7.0 to -10.0 kcal/mol
                      </Descriptions.Item>
                      <Descriptions.Item label="Moderate Binding">
                        -5.0 to -7.0 kcal/mol
                      </Descriptions.Item>
                      <Descriptions.Item label="Weak Binding">
                        -3.0 to -5.0 kcal/mol
                      </Descriptions.Item>
                      <Descriptions.Item label="Poor Binding">
                        &gt; -3.0 kcal/mol
                      </Descriptions.Item>
                    </Descriptions>
                    <Paragraph className="mt-3">
                      <Text strong>Remember:</Text> More negative = stronger binding. -8.5 is better than -6.2
                    </Paragraph>
                  </div>
                )
              },
              {
                key: '6',
                label: 'Where can I get ligands for testing?',
                children: (
                  <div>
                    <Paragraph><strong>Option 1: PubChem (Recommended for beginners)</strong></Paragraph>
                    <ul>
                      <li>Go to PubChem tab</li>
                      <li>Search by compound name or SMILES</li>
                      <li>Download SDF files</li>
                      <li>Huge database of validated compounds</li>
                    </ul>
                    <Paragraph className="mt-3"><strong>Option 2: Your Own Compounds</strong></Paragraph>
                    <ul>
                      <li>Create SDF files using chemical drawing software (ChemDraw, Avogadro, etc.)</li>
                      <li>Convert from other formats (MOL, MOL2) to SDF</li>
                    </ul>
                  </div>
                )
              },
              {
                key: '7',
                label: 'Can I run multiple projects at once?',
                children: (
                  <Paragraph>
                    Yes! You can create and submit multiple projects. They will be processed in queue.
                    Each project runs independently.
                  </Paragraph>
                )
              },
              {
                key: '8',
                label: 'What if my job fails?',
                children: (
                  <div>
                    <Paragraph>Common reasons and solutions:</Paragraph>
                    <ul>
                      <li><strong>Wrong file format:</strong> Make sure protein is PDBQT and ligands are SDF</li>
                      <li><strong>Invalid ligand residue name:</strong> Check the 3-letter code in PDB file</li>
                      <li><strong>Corrupted files:</strong> Re-download and try again</li>
                      <li><strong>Server error:</strong> Contact support or try again later</li>
                    </ul>
                  </div>
                )
              }
            ]}
          />
        </Card>
      )
    }
  ];

  return (
    <div className="min-h-full p-4 md:p-6 space-y-6 molecular-bg">
      {/* Header */}
      <div className="bg-background-light-primary dark:bg-background-dark-secondary rounded-2xl shadow-soft border border-border-light-default dark:border-border-dark-subtle p-6 backdrop-blur-sm">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center">
            <FileTextOutlined className="text-2xl text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">
              Help & Tutorial
            </h1>
            <p className="text-text-light-secondary dark:text-text-dark-secondary">
              Complete step-by-step guide to molecular docking workflow
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Card className="card-scientific p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full flex flex-wrap justify-center gap-2 border-b border-border bg-muted/40 p-4">
            {tabItems.map((item) => (
              <TabsTrigger
                key={item.key}
                value={item.key}
                className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabItems.map((item) => (
            <TabsContent
              key={item.key}
              value={item.key}
              className="p-6 space-y-6 focus:outline-none"
            >
              {item.children}
            </TabsContent>
          ))}
        </Tabs>
      </Card>

      {/* Quick Help */}
      <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
        <Title level={4} className="text-center">
          🆘 Need More Help?
        </Title>
        <Row gutter={16} className="mt-4">
          <Col span={8}>
            <Card type="inner" className="text-center">
              <div className="text-3xl mb-2">💬</div>
              <Text strong>AI Assistant</Text>
              <Paragraph type="secondary" className="text-sm">
                Chat with our AI for instant help
              </Paragraph>
              <Button type="primary" icon={<ArrowRightOutlined />} href="/chatbot">
                Open Chat
              </Button>
            </Card>
          </Col>
          <Col span={8}>
            <Card type="inner" className="text-center">
              <div className="text-3xl mb-2">📧</div>
              <Text strong>Email Support</Text>
              <Paragraph type="secondary" className="text-sm">
                Contact our support team
              </Paragraph>
              <Button icon={<ArrowRightOutlined />}>
                Send Email
              </Button>
            </Card>
          </Col>
          <Col span={8}>
            <Card type="inner" className="text-center">
              <div className="text-3xl mb-2">📚</div>
              <Text strong>Documentation</Text>
              <Paragraph type="secondary" className="text-sm">
                Read detailed docs
              </Paragraph>
              <Button icon={<ArrowRightOutlined />}>
                View Docs
              </Button>
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default HelpWorkflow;
