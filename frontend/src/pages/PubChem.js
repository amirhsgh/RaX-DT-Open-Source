import { Database, Download, Eye, FileText, FlaskConical, Search } from 'lucide-react';
import { message } from '../utils/toast';
import React, { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/UI/tooltip';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/UI/tabs';

import { Alert } from '../components/UI/Alert';

import { Form } from '../components/UI/form';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/UI/dialog';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI/table';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/UI/select';

import { Input } from '../components/UI/Input';

import { Card, CardHeader, CardTitle, CardContent } from '../components/UI/Card';

import { Button } from '../components/UI/Button';

import { Badge } from '../components/UI/Badge';
import { cn } from '../utils/cn';

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/UI/accordion';

import { pubchemService } from '../services/pubchemAPI';

const PubChem = () => {
  const form = useForm({
    defaultValues: {
      searchType: 'name',
      nameType: 'complete',
      threshold: 90,
      maxRecords: 100,
    }
  });
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchType, setSearchType] = useState('name');
  const [currentSearch, setCurrentSearch] = useState(null);
  const [selectedCompound, setSelectedCompound] = useState(null);
  const [compoundDetails, setCompoundDetails] = useState(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  // Available properties for compound property search
  const availableProperties = [
    'MolecularFormula',
    'MolecularWeight',
    'SMILES',
    'InChI',
    'InChIKey',
    'IUPACName',
    'Title',
    'XLogP',
    'ExactMass',
    'TPSA',
    'Complexity',
    'Charge',
    'HBondDonorCount',
    'HBondAcceptorCount',
    'RotatableBondCount',
    'HeavyAtomCount',
  ];

  const [selectedProperties, setSelectedProperties] = useState([
    'MolecularFormula',
    'MolecularWeight',
    'InChIKey',
    'SMILES',
    'IUPACName',
  ]);

  // Search function
  const handleSearch = useCallback(async (values) => {
    setLoading(true);
    setSearchResults([]); // Clear previous results
    try {
      const { searchTerm, searchType: type, nameType, threshold, maxRecords } = values;

      if (!searchTerm?.trim()) {
        message.error('Please enter a search term');
        setLoading(false);
        return;
      }

      console.log('Starting search:', { searchTerm, type }); // Debug log

      // Test API connection first
      console.log('Testing API connection to:', pubchemService.compound.searchByName.toString());

      setCurrentSearch({ searchTerm, searchType: type });
      let response;

      switch (type) {
        case 'name':
          response = await pubchemService.compound.searchByName(
            searchTerm,
            'JSON',
            { nameType: nameType || 'complete' }
          );
          break;
        case 'smiles':
          if (!pubchemService.utils.isValidSMILES(searchTerm)) {
            message.error('Invalid SMILES format');
            return;
          }
          response = await pubchemService.compound.searchBySmiles(searchTerm);
          break;
        case 'inchi':
          if (!pubchemService.utils.isValidInChI(searchTerm)) {
            message.error('Invalid InChI format');
            return;
          }
          response = await pubchemService.compound.searchByInChI(searchTerm);
          break;
        case 'inchikey':
          if (!pubchemService.utils.isValidInChIKey(searchTerm)) {
            message.error('Invalid InChI Key format');
            return;
          }
          response = await pubchemService.compound.searchByInChIKey(searchTerm);
          break;
        case 'cid':
          if (!pubchemService.utils.isValidCID(searchTerm)) {
            message.error('Invalid CID format - must be a positive integer');
            return;
          }
          response = await pubchemService.compound.searchByCID(searchTerm);
          break;
        case 'formula':
          if (!pubchemService.utils.isValidFormula(searchTerm)) {
            message.error('Invalid molecular formula format');
            return;
          }
          response = await pubchemService.compound.searchByFormula(
            searchTerm,
            'JSON',
            { maxRecords: maxRecords || 100 }
          );
          break;
        case 'similarity':
          response = await pubchemService.compound.similaritySearch(
            searchTerm,
            'smiles',
            { threshold: threshold || 90, maxRecords: maxRecords || 100 }
          );
          break;
        case 'substructure':
          response = await pubchemService.compound.substructureSearch(
            searchTerm,
            'smiles',
            { maxRecords: maxRecords || 100 }
          );
          break;
        default:
          message.error('Unknown search type');
          return;
      }

      console.log('Search response:', response.data); // Debug log

      const cids = response.data?.IdentifierList?.CID || [];
      if (cids.length === 0) {
        message.info('No compounds found for your search term');
        setSearchResults([]);
        return;
      }

      console.log(`Found ${cids.length} CIDs, fetching properties...`); // Debug log

      // Get properties for found compounds
      const propertiesResponse = await pubchemService.compound.getProperties(
        cids.slice(0, 50), // Limit to first 50 results
        selectedProperties
      );

      console.log('Properties response:', propertiesResponse.data); // Debug log

      const compounds = propertiesResponse.data?.PropertyTable?.Properties || [];
      setSearchResults(compounds.map(compound => ({
        ...compound,
        key: compound.CID,
      })));

      message.success(`Found ${cids.length} compounds (showing first ${compounds.length})`);
    } catch (error) {
      console.error('Search error:', error);

      // Handle different error types
      if (error.code === 'PUGREST.NotFound') {
        message.info('No compounds found matching your search');
        setSearchResults([]);
      } else if (error.code === 'PUGREST.ServerBusy') {
        message.warning('PubChem server is busy. Please try again in a few seconds.');
      } else if (error.code === 'PUGREST.Timeout') {
        message.error('Search timed out. Please try with a more specific search term.');
      } else if (error.response?.status === 404) {
        message.info('No compounds found');
        setSearchResults([]);
      } else if (error.message?.includes('Network Error')) {
        message.error('Network error. Please check your internet connection.');
      } else {
        message.error(`Search failed: ${error.message || 'Please try again.'}`);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedProperties]);

  // View compound details
  const viewCompoundDetails = async (cid) => {
    setLoading(true);
    try {
      const [propertiesResponse, synonymsResponse] = await Promise.all([
        pubchemService.compound.getProperties(cid, availableProperties),
        pubchemService.compound.getSynonyms(cid),
      ]);

      const properties = propertiesResponse.data?.PropertyTable?.Properties?.[0] || {};
      const synonyms = synonymsResponse.data?.InformationList?.Information?.[0]?.Synonym || [];

      setCompoundDetails({
        ...properties,
        synonyms: synonyms.slice(0, 20), // Limit synonyms display
      });
      setSelectedCompound(cid);
      setDetailsModalVisible(true);
    } catch (error) {
      console.error('Error fetching compound details:', error);
      message.error('Failed to fetch compound details');
    } finally {
      setLoading(false);
    }
  };

  // Download functions
  const downloadCompound = async (cid, format, filename) => {
    try {
      const response = await pubchemService.compound.getRecord(cid, format.toUpperCase());
      const blob = new Blob([response.data], {
        type: format === 'sdf' ? 'chemical/x-mdl-sdfile' : 'image/png',
      });

      pubchemService.utils.downloadFile(
        blob,
        filename || `compound_${cid}`,
        format
      );
      message.success(`Downloaded ${format.toUpperCase()} file`);
    } catch (error) {
      console.error('Download error:', error);
      message.error(`Failed to download ${format.toUpperCase()} file`);
    }
  };

  const downloadResults = async (format) => {
    try {
      if (searchResults.length === 0) {
        message.error('No results to download');
        return;
      }

      const cids = searchResults.map(r => r.CID);
      let blob, mimeType;

      if (format === 'csv') {
        // Create CSV from current results
        const headers = Object.keys(searchResults[0]).filter(key => key !== 'key');
        const csvContent = [
          headers.join(','),
          ...searchResults.map(row =>
            headers.map(header => `"${row[header] || ''}"`).join(',')
          ),
        ].join('\n');

        blob = new Blob([csvContent], { type: 'text/csv' });
        mimeType = 'csv';
      } else {
        // Download SDF for all compounds
        const responses = await Promise.all(
          cids.slice(0, 10).map(cid => // Limit to first 10 for SDF
            pubchemService.compound.getRecord(cid, 'SDF')
          )
        );

        const sdfContent = responses.map(r => r.data).join('\n$$$$\n');
        blob = new Blob([sdfContent], { type: 'chemical/x-mdl-sdfile' });
        mimeType = 'sdf';
      }

      const filename = pubchemService.utils.generateFilename(
        currentSearch?.searchTerm || 'search_results',
        mimeType,
        'compounds'
      );

      pubchemService.utils.downloadFile(blob, filename, mimeType);
      message.success(`Downloaded ${format.toUpperCase()} file`);
    } catch (error) {
      console.error('Download error:', error);
      message.error(`Failed to download ${format.toUpperCase()} file`);
    }
  };

  const searchTypeOptions = [
    { value: 'name', label: 'Compound Name', icon: <FileText /> },
    { value: 'cid', label: 'Compound ID (CID)', icon: <Database /> },
    { value: 'smiles', label: 'SMILES', icon: <Database /> },
    { value: 'inchi', label: 'InChI', icon: <Database /> },
    { value: 'inchikey', label: 'InChI Key', icon: <Database /> },
    { value: 'formula', label: 'Molecular Formula', icon: <FlaskConical /> },
    { value: 'similarity', label: 'Similarity Search', icon: <Search /> },
    { value: 'substructure', label: 'Substructure Search', icon: <Search /> },
  ];

  const tabItems = [
    {
      key: 'search',
      label: 'Compound Search',
      children: (
        <>
          <Form form={form} as="div">
            <form onSubmit={form.handleSubmit(handleSearch)} className="space-y-8 mb-4 ml-4 mr-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-6">
              <div className="md:col-span-4">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Search Type *
                  </label>
                  <Select value={searchType} onValueChange={setSearchType}>
                    <SelectTrigger className="h-12 text-sm">
                      <SelectValue placeholder="Select search type" />
                    </SelectTrigger>
                    <SelectContent>
                      {searchTypeOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            {option.icon} <span>{option.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="md:col-span-8">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Search Term *
                  </label>
                  <Input
                    className="h-12 text-sm"
                    {...form.register('searchTerm', { required: 'Please enter a search term' })}
                    placeholder={
                      searchType === 'name' ? 'e.g., aspirin, caffeine' :
                      searchType === 'cid' ? 'e.g., 2244, 2519' :
                      searchType === 'smiles' ? 'e.g., CC(=O)OC1=CC=CC=C1C(=O)O' :
                      searchType === 'inchi' ? 'e.g., InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)' :
                      searchType === 'inchikey' ? 'e.g., BSYNRYMUTXBXSQ-UHFFFAOYSA-N' :
                      searchType === 'formula' ? 'e.g., C9H8O4' :
                      'Enter search term'
                    }
                  />
                  {form.formState.errors.searchTerm && (
                    <p className="text-sm text-destructive">{form.formState.errors.searchTerm.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Additional options based on search type */}
            {searchType === 'name' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-6 mt-6">
                <div className="md:col-span-4">
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Name Type
                    </label>
                    <Select defaultValue="complete" onValueChange={(value) => form.setValue('nameType', value)}>
                      <SelectTrigger className="h-12 text-sm">
                        <SelectValue placeholder="Select name type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="complete">Complete Match</SelectItem>
                        <SelectItem value="word">Word Match</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {(searchType === 'similarity' || searchType === 'substructure' || searchType === 'formula') && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-6 mt-6">
                {searchType === 'similarity' && (
                  <div className="md:col-span-4">
                    <div className="space-y-3">
                      <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Similarity Threshold (%)
                      </label>
                      <Input
                        type="number"
                        min={50}
                        max={100}
                        className="h-12 text-sm"
                        {...form.register('threshold')}
                      />
                    </div>
                  </div>
                )}
                <div className="md:col-span-4">
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Max Results
                    </label>
                    <Select defaultValue="100" onValueChange={(value) => form.setValue('maxRecords', parseInt(value))}>
                      <SelectTrigger className="h-12 text-sm">
                        <SelectValue placeholder="Select max results" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="500">500</SelectItem>
                        <SelectItem value="1000">1000</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-2 items-center">
              <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="gap-2"
              >
                <Search className="h-4 w-4" />
                {loading ? 'Searching...' : 'Search'}
              </Button>
              <Button
                variant="outline"
                type="button"
                size="lg"
                onClick={() => form.reset()}
                disabled={loading}
                className="gap-2"
              >
                Clear
              </Button>
              <Button
                variant="outline"
                type="button"
                size="lg"
                onClick={() => {
                  form.reset({
                    searchType: 'name',
                    searchTerm: 'aspirin',
                    nameType: 'complete',
                    threshold: 90,
                    maxRecords: 100,
                  });
                  handleSearch({ searchType: 'name', searchTerm: 'aspirin' });
                }}
                disabled={loading}
                className="gap-2"
              >
                Test Search
              </Button>
            </div>
            </form>
          </Form>

          {/* Property Selection */}
          <Card className="bg-card border-border rounded-lg mb-4 ml-4 mr-4">
            <CardHeader>
              <CardTitle className="text-base font-semibold tracking-tight">Display Properties</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-6">
              <div className="flex flex-wrap gap-3 md:gap-4">
                {availableProperties.map((prop) => {
                  const isSelected = selectedProperties.includes(prop);
                  return (
                    <Badge
                      key={prop}
                      variant={isSelected ? 'default' : 'outline'}
                      className={cn(
                        'cursor-pointer rounded-full border px-4 py-2 text-sm transition-all duration-150',
                        'shadow-sm backdrop-blur-sm',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary/60 shadow-primary/40 hover:bg-primary/90'
                          : 'bg-muted/20 text-muted-foreground border-border/70 hover:border-primary/50 hover:text-primary hover:bg-primary/10'
                      )}
                      onClick={() => {
                        setSelectedProperties((prev) =>
                          prev.includes(prop)
                            ? prev.filter((p) => p !== prop)
                            : [...prev, prop]
                        );
                      }}
                    >
                      {prop}
                    </Badge>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {searchResults.length > 0 && (
            <Card className="bg-card border-border rounded-lg">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Search Results ({searchResults.length})</CardTitle>
                  <div className="flex gap-2 items-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadResults('csv')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadResults('sdf')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      SDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">CID</TableHead>
                        <TableHead className="w-[150px]">Molecular Formula</TableHead>
                        <TableHead className="w-[120px]">Molecular Weight</TableHead>
                        <TableHead>IUPAC Name</TableHead>
                        <TableHead className="w-[200px]">InChI Key</TableHead>
                        <TableHead className="w-[200px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchResults.map((record) => (
                        <TableRow key={record.CID}>
                          <TableCell>
                            <Button variant="link" onClick={() => viewCompoundDetails(record.CID)}>
                              {record.CID}
                            </Button>
                          </TableCell>
                          <TableCell>{record.MolecularFormula || '-'}</TableCell>
                          <TableCell>
                            {record.MolecularWeight ? `${parseFloat(record.MolecularWeight).toFixed(2)} g/mol` : '-'}
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm truncate max-w-xs block">{record.IUPACName || '-'}</span>
                                </TooltipTrigger>
                                <TooltipContent>{record.IUPACName}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <code className="px-1 py-0.5 bg-muted rounded text-sm truncate block max-w-[180px]">
                                    {record.InChIKey || '-'}
                                  </code>
                                </TooltipTrigger>
                                <TooltipContent>{record.InChIKey}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2 items-center">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => viewCompoundDetails(record.CID)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View Details</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => downloadCompound(record.CID, 'sdf')}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Download SDF</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => downloadCompound(record.CID, 'png')}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Download PNG</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ),
    },
    {
      key: 'batch',
      label: 'Batch Operations',
      children: (
        <>
          <Alert
            message="Batch Operations"
            description="Upload a list of compound identifiers (CIDs, names, SMILES) to retrieve properties or structures in bulk."
            type="info"
            showIcon
            className="mb-4"
          />
          <span className="text-sm">Batch operations feature coming soon...</span>
        </>
      ),
    },
  ];

  return (
    <div className="p-6 bg-background">
      <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <Database /> PubChem Database Search
      </h2>

      <Alert
        message="PubChem Integration"
        description="Search and explore chemical compounds using PubChem's comprehensive database. Find compounds by name, structure, or properties, and download results in various formats."
        type="info"
        showIcon
        className="mb-6"
      />

      <Card className="bg-card border-border rounded-lg">
        <Tabs defaultValue="search">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">Compound Search</TabsTrigger>
            <TabsTrigger value="batch">Batch Operations</TabsTrigger>
          </TabsList>
          <TabsContent value="search">
            {tabItems[0].children}
          </TabsContent>
          <TabsContent value="batch">
            {tabItems[1].children}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Compound Details Modal */}
      <Dialog open={detailsModalVisible} onOpenChange={(open) => !open && setDetailsModalVisible(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compound Details - CID: {selectedCompound}</DialogTitle>
          </DialogHeader>
        {compoundDetails && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Basic Properties</CardTitle>
                  </CardHeader>
                  <CardContent>
                  
                    <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">Molecular Formula:</span><span>
                      <span className="font-semibold">{compoundDetails.MolecularFormula || '-'}</span>
                    </span></div>
                    <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">Molecular Weight:</span><span>
                      {compoundDetails.MolecularWeight ?
                        `${parseFloat(compoundDetails.MolecularWeight).toFixed(2)} g/mol` : '-'}
                    </span></div>
                    <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">IUPAC Name:</span><span>
                      <span className="text-sm">{compoundDetails.IUPACName || '-'}</span>
                    </span></div>
                    <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">InChI Key:</span><span>
                      <code className="px-1 py-0.5 bg-muted rounded text-sm">{compoundDetails.InChIKey || '-'}</code>
                    </span></div>
                  </CardContent>
                </Card>
              </div>
              <div className="md:col-span-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Structure</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <img src={`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${selectedCompound}/PNG?image_size=large`} alt="Compound Structure" className="w-full max-w-sm" onError={(e) => e.target.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhqj/fAIcloxgHQqxAjIHBEugw5sUIsSQpBobtQPdLciLEVJYzMPBHMDBsayhILEqEO4DxG0txmrERhM29nYGBddr//5/DGRjYNRkY/l7////39v///y4Dmn+LgeHANwDrkl1AuO+pmgAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAwqADAAQAAAABAAAAwwAAAAD9b/HnAAAHlklEQVR4Ae3dP3Ik1RnG4W+FgYxN"} />
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-4">
              <div className="col-span-12">
                <Accordion type="multiple" className="w-full">
                  <AccordionItem value="chemical">
                    <AccordionTrigger>Chemical Properties</AccordionTrigger>
                    <AccordionContent>
                    
                      <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">SMILES:</span><span>
                        <code className="px-1 py-0.5 bg-muted rounded text-sm">{compoundDetails.CanonicalSMILES || compoundDetails.SMILES || '-'}</code>
                      </span></div>
                      <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">XLogP:</span><span>
                        {compoundDetails.XLogP || '-'}
                      </span></div>
                      <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">Exact Mass:</span><span>
                        {compoundDetails.ExactMass || '-'}
                      </span></div>
                      <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">TPSA:</span><span>
                        {compoundDetails.TPSA || '-'}
                      </span></div>
                      <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">Complexity:</span><span>
                        {compoundDetails.Complexity || '-'}
                      </span></div>
                      <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">Charge:</span><span>
                        {compoundDetails.Charge || '-'}
                      </span></div>
                  </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="bonding">
                    <AccordionTrigger>Hydrogen Bonding</AccordionTrigger>
                    <AccordionContent>
                    
                      <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">H-Bond Donors:</span><span>
                        {compoundDetails.HBondDonorCount || '-'}
                      </span></div>
                      <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">H-Bond Acceptors:</span><span>
                        {compoundDetails.HBondAcceptorCount || '-'}
                      </span></div>
                      <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">Rotatable Bonds:</span><span>
                        {compoundDetails.RotatableBondCount || '-'}
                      </span></div>
                      <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">Heavy Atoms:</span><span>
                        {compoundDetails.HeavyAtomCount || '-'}
                      </span></div>
                  </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="synonyms">
                    <AccordionTrigger>Synonyms</AccordionTrigger>
                    <AccordionContent>
                    <div>
                      {compoundDetails.synonyms?.map((synonym, index) => (
                        <Badge key={index} variant="secondary" className="m-0.5">
                          {synonym}
                        </Badge>
                      ))}
                    </div>
                  </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="structure">
                    <AccordionTrigger>Structure Data</AccordionTrigger>
                    <AccordionContent>

                      <div className="flex justify-between py-2 border-b border-border"><span className="font-medium">InChI:</span><span>
                        <code className="px-1 py-0.5 bg-muted rounded text-sm break-all">
                          {compoundDetails.InChI || '-'}
                        </code>
                      </span></div>
                  </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
          </div>
        )}
              </DialogContent>
      </Dialog>
    </div>
  );
};

export default PubChem;
