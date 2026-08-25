import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/UI/Card';
import NGLViewer from '../components/MoleculeViewer/NGLViewer';
import NGLTest from '../components/MoleculeViewer/NGLTest';
import SimpleNGLTest from '../components/MoleculeViewer/SimpleNGLTest';
import NGLTestDynamic from '../components/MoleculeViewer/NGLTestDynamic';

// Sample PDB data for testing
const sampleProteinPDB = `HEADER    TRANSFERASE                             07-JUN-02   1KZK              
TITLE     CRYSTAL STRUCTURE OF THE CATALYTIC DOMAIN OF HUMAN PROTEIN KINASE CK2 ALPHA SUBUNIT IN COMPLEX WITH ATP
COMPND    MOL_ID: 1;
COMPND   2 MOLECULE: CASEIN KINASE 2, ALPHA 1 POLYPEPTIDE;
COMPND   3 CHAIN: A;
COMPND   4 EC: 2.7.11.1;
ATOM      1  N   MET A   1      20.154  16.967  17.489  1.00 30.00           N  
ATOM      2  CA  MET A   1      19.030  16.081  17.845  1.00 30.00           C  
ATOM      3  C   MET A   1      17.685  16.739  18.167  1.00 30.00           C  
ATOM      4  O   MET A   1      17.580  17.849  18.666  1.00 30.00           O  
ATOM      5  CB  MET A   1      19.410  15.180  18.999  1.00 30.00           C  
ATOM      6  CG  MET A   1      20.530  14.174  18.715  1.00 30.00           C  
ATOM      7  SD  MET A   1      20.062  12.819  17.604  1.00 30.00           S  
ATOM      8  CE  MET A   1      21.449  11.750  17.431  1.00 30.00           C  
TER       9      MET A   1
END
`;

// Sample ligand SDF data for testing
const sampleLigandSDF = `
  Mrv2108 12042111312D          

  6  6  0  0  0  0            999 V2000
   -0.8929    0.5178    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.1784   -0.8947    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.8929   -0.8947    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.6074    0.5178    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.8929    1.9304    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.1784    1.9304    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
  3  4  2  0  0  0  0
  4  5  1  0  0  0  0
  5  6  2  0  0  0  0
  6  1  1  0  0  0  0
M  END
$$$$
`;

const NGLViewerTest = () => {
  return (
    <div className="p-6 bg-background">
      <h2 className="text-2xl font-bold mb-4 text-foreground">🧪 NGL Viewer Test Page</h2>

      <p className="text-muted-foreground mb-6">
        این صفحه برای تست NGL viewer هست. کامپوننت‌های زیر نمونه‌هایی از نمایش سه‌بعدی مولکول‌ها با NGL رو نشون میده.
      </p>

      <div className="space-y-6">

        {/* Test -1: Dynamic Import Test */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>⚡ تست Dynamic Import NGL</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">تست با dynamic import برای حل مشکل import</p>
            <NGLTestDynamic />
          </CardContent>
        </Card>

        {/* Test 0: Very Simple NGL Test */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>🔬 تست خیلی ساده NGL</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">تست اولیه برای بررسی import و Stage</p>
            <SimpleNGLTest />
          </CardContent>
        </Card>

        {/* Test 0.5: Simple NGL Test */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>🧪 تست ساده NGL</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">تست اولیه برای بررسی لود شدن NGL</p>
            <NGLTest />
          </CardContent>
        </Card>

        {/* Test 1: Protein Only */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>🧬 تست 1: فقط پروتیین (PDB)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">نمایش ساختار پروتیین با استفاده از داده‌های PDB نمونه</p>
            <NGLViewer
              pdbData={sampleProteinPDB}
              height={400}
              showControls={true}
            />
          </CardContent>
        </Card>

        {/* Test 2: Ligand Only */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>💊 تست 2: فقط لیگاند (SDF)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">نمایش ساختار مولکول کوچک با فرمت SDF</p>
            <NGLViewer
              ligandData={sampleLigandSDF}
              height={400}
              showControls={true}
            />
          </CardContent>
        </Card>

        {/* Test 3: Complex (Protein + Ligand) */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>🔬 تست 3: کمپلکس (پروتیین + لیگاند)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">نمایش همزمان پروتیین و لیگاند در یک مجموعه</p>
            <NGLViewer
              pdbData={sampleProteinPDB}
              ligandData={sampleLigandSDF}
              height={500}
              showControls={true}
            />
          </CardContent>
        </Card>

        {/* Test 4: Upload Interface */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>📁 تست 4: رابط آپلود فایل</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">تست قابلیت آپلود فایل‌های مولکولی</p>
            <NGLViewer
              height={450}
              showControls={true}
            />
          </CardContent>
        </Card>

        {/* Usage Instructions */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>📖 راهنمای استفاده</CardTitle>
          </CardHeader>
          <CardContent>
            <h4 className="font-semibold mb-2">کنترل‌های ماوس:</h4>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li><strong>چرخاندن:</strong> کلیک چپ + کشیدن</li>
              <li><strong>زوم:</strong> کلیک راست + کشیدن یا اسکرول</li>
              <li><strong>جابجایی:</strong> کلیک وسط + کشیدن</li>
            </ul>

            <h4 className="font-semibold mb-2">ویژگی‌های NGL viewer:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>✅ سرعت بالا و کارایی بهتر نسبت به 3Dmol</li>
              <li>✅ پشتیبانی از فرمت‌های PDB, PDBQT, SDF, MOL2</li>
              <li>✅ نمایش‌های مختلف (Cartoon, Ball&Stick, Surface, Licorice)</li>
              <li>✅ قابلیت Screenshot با کیفیت بالا</li>
              <li>✅ کنترل‌های پیشرفته برای Zoom, Pan, Rotate</li>
            </ul>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default NGLViewerTest;