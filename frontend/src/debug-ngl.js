// Debug NGL import
console.log('=== NGL DEBUG START ===');

try {
  // Test different import methods
  console.log('1. Testing import * as NGL from "ngl"');
  import('ngl').then((NGL) => {
    console.log('NGL imported successfully:', NGL);
    console.log('NGL.Stage:', NGL.Stage);
    console.log('NGL default:', NGL.default);
    
    if (NGL.Stage) {
      console.log('✅ NGL.Stage is available');
    } else {
      console.log('❌ NGL.Stage is NOT available');
    }
    
    console.log('All NGL properties:');
    Object.keys(NGL).forEach(key => {
      console.log(`  ${key}:`, typeof NGL[key]);
    });
  }).catch((error) => {
    console.error('Failed to import NGL:', error);
  });

  console.log('2. Testing require("ngl")');
  try {
    const NGL_require = require('ngl');
    console.log('NGL via require:', NGL_require);
  } catch (e) {
    console.log('Cannot use require() for NGL:', e.message);
  }

} catch (error) {
  console.error('Error in NGL debug:', error);
}

console.log('=== NGL DEBUG END ===');