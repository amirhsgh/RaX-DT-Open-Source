import axios from 'axios';

// PubChem PUG REST API base URL - correct endpoint
const PUBCHEM_BASE_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

// Rate limiting: Max 5 requests per second as per PubChem guidelines
// Currently handled by the proxy middleware

// Create a separate axios instance for PubChem API
const pubchemAPI = axios.create({
  baseURL: PUBCHEM_BASE_URL,
  timeout: 60000, // 60 seconds timeout (PubChem can be slow)
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'BioForge-Frontend/1.0',
  },
});

// Add response interceptor for error handling
pubchemAPI.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('PubChem API Error:', error);

    // Handle specific PubChem error codes
    if (error.response?.data?.Fault) {
      const fault = error.response.data.Fault;
      console.error('PubChem Fault:', fault);

      // Create a more descriptive error
      const enhancedError = new Error(fault.Message || 'PubChem API Error');
      enhancedError.code = fault.Code;
      enhancedError.originalError = error;
      return Promise.reject(enhancedError);
    }

    return Promise.reject(error);
  }
);

/**
 * PubChem API Service
 * Provides methods to interact with PubChem PUG REST API
 */
export const pubchemService = {
  // Compound search operations
  compound: {
    /**
     * Search compounds by name
     * @param {string} name - Compound name
     * @param {string} outputFormat - Output format (JSON, XML, SDF, etc.)
     * @param {object} options - Additional options
     */
    searchByName: async (name, outputFormat = 'JSON', options = {}) => {
      const { nameType = 'complete' } = options;
      const url = `/compound/name/${encodeURIComponent(name)}/cids/${outputFormat}`;
      const params = nameType !== 'complete' ? { name_type: nameType } : {};
      return pubchemAPI.get(url, { params });
    },

    /**
     * Search compounds by SMILES
     * @param {string} smiles - SMILES string
     * @param {string} outputFormat - Output format
     */
    searchBySmiles: async (smiles, outputFormat = 'JSON') => {
      const url = `/compound/smiles/${encodeURIComponent(smiles)}/cids/${outputFormat}`;
      return pubchemAPI.get(url);
    },

    /**
     * Search compounds by InChI
     * @param {string} inchi - InChI string
     * @param {string} outputFormat - Output format
     */
    searchByInChI: async (inchi, outputFormat = 'JSON') => {
      // InChI searches require POST for longer strings
      const url = `/compound/inchi/cids/${outputFormat}`;
      return pubchemAPI.post(url, `inchi=${encodeURIComponent(inchi)}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    },

    /**
     * Search compounds by InChI Key
     * @param {string} inchiKey - InChI Key
     * @param {string} outputFormat - Output format
     */
    searchByInChIKey: async (inchiKey, outputFormat = 'JSON') => {
      const url = `/compound/inchikey/${encodeURIComponent(inchiKey)}/cids/${outputFormat}`;
      return pubchemAPI.get(url);
    },

    /**
     * Search compounds by CID
     * @param {string|number} cid - Compound ID
     * @param {string} outputFormat - Output format
     */
    searchByCID: async (cid, outputFormat = 'JSON') => {
      const url = `/compound/cid/${cid}/cids/${outputFormat}`;
      return pubchemAPI.get(url);
    },

    /**
     * Search compounds by molecular formula
     * @param {string} formula - Molecular formula
     * @param {string} outputFormat - Output format
     * @param {object} options - Search options
     */
    searchByFormula: async (formula, outputFormat = 'JSON', options = {}) => {
      const { allowOtherElements = false, maxRecords = 100 } = options;
      const url = `/compound/fastformula/${encodeURIComponent(formula)}/cids/${outputFormat}`;
      const params = {
        AllowOtherElements: allowOtherElements,
        MaxRecords: maxRecords,
      };
      return pubchemAPI.get(url, { params });
    },

    /**
     * Get compound record by CID
     * @param {number} cid - Compound ID
     * @param {string} outputFormat - Output format
     * @param {object} options - Additional options
     */
    getRecord: async (cid, outputFormat = 'JSON', options = {}) => {
      const { recordType = '2d', imageSize = 'large' } = options;
      const url = `/compound/cid/${cid}/${outputFormat}`;
      const params = {};
      if (outputFormat === 'PNG') {
        params.record_type = recordType;
        params.image_size = imageSize;
      }
      return pubchemAPI.get(url, {
        params,
        responseType: outputFormat === 'PNG' || outputFormat === 'SDF' ? 'blob' : 'json'
      });
    },

    /**
     * Get compound properties
     * @param {number|number[]} cids - Single CID or array of CIDs
     * @param {string[]} properties - Array of property names
     * @param {string} outputFormat - Output format
     */
    getProperties: async (cids, properties = [], outputFormat = 'JSON') => {
      const cidList = Array.isArray(cids) ? cids.join(',') : cids;
      const propertyList = properties.length > 0 ? properties.join(',') : 'MolecularFormula,MolecularWeight,InChIKey,SMILES,IUPACName';
      const url = `/compound/cid/${cidList}/property/${propertyList}/${outputFormat}`;
      return pubchemAPI.get(url);
    },

    /**
     * Get compound synonyms
     * @param {number} cid - Compound ID
     * @param {string} outputFormat - Output format
     */
    getSynonyms: async (cid, outputFormat = 'JSON') => {
      const url = `/compound/cid/${cid}/synonyms/${outputFormat}`;
      return pubchemAPI.get(url);
    },

    /**
     * Structure similarity search
     * @param {string} structure - SMILES, InChI, or CID
     * @param {string} structureType - Type of structure (smiles, inchi, cid)
     * @param {object} options - Search options
     */
    similaritySearch: async (structure, structureType = 'smiles', options = {}) => {
      const { threshold = 90, maxRecords = 100 } = options;
      const url = `/compound/fastsimilarity_2d/${structureType}/${encodeURIComponent(structure)}/cids/JSON`;
      const params = {
        Threshold: threshold,
        MaxRecords: maxRecords,
      };
      return pubchemAPI.get(url, { params });
    },

    /**
     * Substructure search
     * @param {string} structure - SMILES, InChI, or CID
     * @param {string} structureType - Type of structure (smiles, inchi, cid)
     * @param {object} options - Search options
     */
    substructureSearch: async (structure, structureType = 'smiles', options = {}) => {
      const { maxRecords = 100, stripHydrogen = false } = options;
      const url = `/compound/fastsubstructure/${structureType}/${encodeURIComponent(structure)}/cids/JSON`;
      const params = {
        MaxRecords: maxRecords,
        StripHydrogen: stripHydrogen,
      };
      return pubchemAPI.get(url, { params });
    },

    /**
     * Identity search
     * @param {string} structure - SMILES, InChI, or CID
     * @param {string} structureType - Type of structure (smiles, inchi, cid)
     * @param {object} options - Search options
     */
    identitySearch: async (structure, structureType = 'smiles', options = {}) => {
      const { identityType = 'same_stereo_isotope', maxRecords = 100 } = options;
      const url = `/compound/fastidentity/${structureType}/${encodeURIComponent(structure)}/cids/JSON`;
      const params = {
        identity_type: identityType,
        MaxRecords: maxRecords,
      };
      return pubchemAPI.get(url, { params });
    },
  },

  // Substance search operations
  substance: {
    /**
     * Search substances by name
     * @param {string} name - Substance name
     * @param {string} outputFormat - Output format
     * @param {object} options - Additional options
     */
    searchByName: async (name, outputFormat = 'JSON', options = {}) => {
      const { sourceName = null } = options;
      const url = `/substance/name/${encodeURIComponent(name)}/sids/${outputFormat}`;
      const params = sourceName ? { sourcename: sourceName } : {};
      return pubchemAPI.get(url, { params });
    },

    /**
     * Get substance record by SID
     * @param {number} sid - Substance ID
     * @param {string} outputFormat - Output format
     */
    getRecord: async (sid, outputFormat = 'JSON') => {
      const url = `/substance/sid/${sid}/${outputFormat}`;
      return pubchemAPI.get(url, {
        responseType: outputFormat === 'PNG' || outputFormat === 'SDF' ? 'blob' : 'json'
      });
    },
  },

  // Utility functions
  utils: {
    /**
     * Download file with proper filename
     * @param {Blob} blob - File blob
     * @param {string} filename - Filename
     * @param {string} format - File format
     */
    downloadFile: (blob, filename, format) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${format.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },

    /**
     * Generate filename for downloads
     * @param {string} searchTerm - Search term
     * @param {string} format - File format
     * @param {string} type - Search type
     */
    generateFilename: (searchTerm, format, type = 'compound') => {
      const sanitized = searchTerm.replace(/[^a-zA-Z0-9]/g, '_');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      return `${type}_${sanitized}_${timestamp}`;
    },

    /**
     * Validate SMILES string
     * @param {string} smiles - SMILES string to validate
     */
    isValidSMILES: (smiles) => {
      // Basic SMILES validation
      const smilesRegex = /^[A-Za-z0-9@+\-[\]()=#$:/\\.|]+$/;
      return smilesRegex.test(smiles) && smiles.length > 0;
    },

    /**
     * Validate InChI string
     * @param {string} inchi - InChI string to validate
     */
    isValidInChI: (inchi) => {
      return inchi.startsWith('InChI=') && inchi.length > 6;
    },

    /**
     * Validate InChI Key
     * @param {string} inchiKey - InChI Key to validate
     */
    isValidInChIKey: (inchiKey) => {
      // InChI Key format: 27 characters, two parts separated by hyphen
      const inchiKeyRegex = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;
      return inchiKeyRegex.test(inchiKey);
    },

    /**
     * Validate molecular formula
     * @param {string} formula - Molecular formula to validate
     */
    isValidFormula: (formula) => {
      // Basic molecular formula validation
      const formulaRegex = /^[A-Z][a-z]?[0-9]*([A-Z][a-z]?[0-9]*)*$/;
      return formulaRegex.test(formula);
    },

    /**
     * Validate CID (Compound ID)
     * @param {string|number} cid - CID to validate
     */
    isValidCID: (cid) => {
      // CID should be a positive integer
      const cidNumber = parseInt(cid, 10);
      return !isNaN(cidNumber) && cidNumber > 0 && cidNumber.toString() === cid.toString();
    },
  },
};

export default pubchemService;