// Database berat bundle (gram -> akan dibagi 1000 untuk kg)
const beratBundleDB = {
  "SINGLE 36X69|13|32": 1.09, "SINGLE 36X69|13|33": 1.10, "SINGLE 36X69|13|40": 1.33,
  "SINGLE 36X69|13|50": 1.67, "SINGLE 36X69|13|51": 1.69, "SINGLE 36X69|13|60": 2.00,
  "SINGLE 36X69|14|32": 1.39, "SINGLE 36X69|14|33": 1.43, "SINGLE 36X69|14|40": 1.67,
  "SINGLE 36X69|14|50": 2.04, "SINGLE 36X69|14|51": 2.08, "SINGLE 36X69|14|60": 2.40,
  "1 1/4 44X78|13|32": 1.48, "1 1/4 44X78|13|33": 1.54, "1 1/4 44X78|13|40": 1.90, 
  "1 1/4 44X78|13|50": 2.34, "1 1/4 44X78|14|32": 1.62, "1 1/4 44X78|14|33": 1.65, 
  "1 1/4 44X78|14|35": 1.75, "1 1/4 44X78|14|40": 2.08, "1 1/4 44X78|14|42": 2.21, 
  "1 1/4 44X78|14|50": 2.50, "1 1/4 44X78|14|51": 2.58, "1 1/4 44X78|14|52": 2.64,
  "CLEAR PAPER 1 1/4 44X78|35|50": 5.75,
  "KS 54X97|14|32": 2.50, "KS 54X97|14|33": 2.58, "KS 54X97|14|40": 3.05, "KS 54X97|14|50": 3.82,
  "KS 54X97|20|32": 4.34, "KS 54X97|20|33": 4.42, "KS 54X97|20|40": 5.22, "KS 54X97|20|50": 6.32,
  "KSS 44X108|13|32": 2.19, "KSS 44X108|13|33": 2.26, "KSS 44X108|13|40": 2.76, "KSS 44X108|13|50": 3.44,
  "KSS 44X108|14|33": 2.31, "KSS 44X108|14|35": 2.49, "KSS 44X108|14|40": 2.79,
  "KSS 44X108|14|42": 2.89, "KSS 44X108|14|50": 3.49, "KSS 44X108|14|51": 3.56, "KSS 44X108|14|52": 3.58,
  "KSS SLIM 36X108|14|32": 1.88, "KSS SLIM 36X108|14|33": 1.95, "KSS SLIM 36X108|14|34": 2.00,
  "KSS SLIM 36X108|14|40": 2.35, "KSS SLIM 36X108|14|50": 2.95,
  "SKS 54X108|13|33": 2.63, "SKS 54X108|13|40": 3.20, "SKS 54X108|13|50": 4.02,
  "SKS 54X108|14|33": 2.92, "SKS 54X108|14|40": 3.52, "SKS 54X108|14|50": 4.40,
  "CLEAR PAPER SKS 54X108|35|50": 10.28
};

// Map berat box (kg)
const beratBoxMap = {
  "White": 0.90,
  "White New": 0.80,
  "Grey": 1.25,
  "Green Jumbo": 3.80
};

// Fungsi untuk mendapatkan berat bundle per kg
function getBeratBundleKG(size, gsm, leaves) {
  const key = `${size}|${gsm}|${leaves}`;
  const gram = beratBundleDB[key];
  if (!gram) return null;
  return gram / 1000;
}