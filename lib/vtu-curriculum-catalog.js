// lib/vtu-curriculum-catalog.js
// Official VTU Curriculum Data for Schemes 2022 and 2025 across 8 branches (AI, CS, CV, DS, EC, EE, ME, RI)

export const VTU_SUPPORTED_BRANCHES = {
    'AI': 'AI & Machine Learning',
    'CS': 'Computer Science & Engineering',
    'CV': 'Civil Engineering',
    'DS': 'Computer Science & Engineering (Data Science)',
    'EC': 'Electronics & Communication Engineering',
    'EE': 'Electrical & Electronics Engineering',
    'ME': 'Mechanical Engineering',
    'RI': 'Robotics & Artificial Intelligence'
};

export const OFFICIAL_CREDITS_LOOKUP = {
  "2022_BMATS101": 4,
  "BMATS101": 4,
  "2022_BPHYS102": 4,
  "BPHYS102": 4,
  "2022_BPOPS103": 3,
  "BPOPS103": 3,
  "2022_BESCK104X": 3,
  "BESCK104X": 3,
  "2022_BETCK105X": 3,
  "BETCK105X": 3,
  "2022_BPLCK105X": 3,
  "BPLCK105X": 3,
  "2022_BENGK106": 1,
  "BENGK106": 1,
  "2022_BIDTK158": 1,
  "BIDTK158": 1,
  "2022_BSFHK158": 1,
  "BSFHK158": 1,
  "2022_BESCK104A": 3,
  "BESCK104A": 3,
  "2022_BESCK104B": 3,
  "BESCK104B": 3,
  "2022_BESCK104C": 3,
  "BESCK104C": 3,
  "2022_BESCK104D": 3,
  "BESCK104D": 3,
  "2022_BESCK104E": 3,
  "BESCK104E": 3,
  "2022_BETCK105F": 3,
  "BETCK105F": 3,
  "2022_BETCK105G": 3,
  "BETCK105G": 3,
  "2022_BETCK105H": 3,
  "BETCK105H": 3,
  "2022_BETCK105I": 3,
  "BETCK105I": 3,
  "2022_BETCK105J": 3,
  "BETCK105J": 3,
  "2022_BPLCK105A": 3,
  "BPLCK105A": 3,
  "2022_BPLCK105B": 3,
  "BPLCK105B": 3,
  "2022_BPLCK105C": 3,
  "BPLCK105C": 3,
  "2022_BPLCK105D": 3,
  "BPLCK105D": 3,
  "2022_BMATS201": 4,
  "BMATS201": 4,
  "2022_BCHES202": 4,
  "BCHES202": 4,
  "2022_BCEDK203": 3,
  "BCEDK203": 3,
  "2022_BESCK204X": 3,
  "BESCK204X": 3,
  "2022_BETCK205X": 3,
  "BETCK205X": 3,
  "2022_BPLCK205X": 3,
  "BPLCK205X": 3,
  "2022_BPWSK206": 1,
  "BPWSK206": 1,
  "2022_BICOK207": 1,
  "BICOK207": 1,
  "2022_BSFHK258": 1,
  "BSFHK258": 1,
  "2022_KIDTK258": 1,
  "KIDTK258": 1,
  "2022_BESCK204A": 3,
  "BESCK204A": 3,
  "2022_BESCK204B": 3,
  "BESCK204B": 3,
  "2022_BESCK204C": 3,
  "BESCK204C": 3,
  "2022_BESCK204D": 3,
  "BESCK204D": 3,
  "2022_BESCK204E": 3,
  "BESCK204E": 3,
  "2022_BETCK205F": 3,
  "BETCK205F": 3,
  "2022_BETCK205G": 3,
  "BETCK205G": 3,
  "2022_BETCK205H": 3,
  "BETCK205H": 3,
  "2022_BETCK205I": 3,
  "BETCK205I": 3,
  "2022_BETCK205J": 3,
  "BETCK205J": 3,
  "2022_BPLCK205A": 3,
  "BPLCK205A": 3,
  "2022_BPLCK205B": 3,
  "BPLCK205B": 3,
  "2022_BPLCK205C": 3,
  "BPLCK205C": 3,
  "2022_BPLCK205D": 3,
  "BPLCK205D": 3,
  "2022_BCHES102": 4,
  "BCHES102": 4,
  "2022_BCEDK103": 3,
  "BCEDK103": 3,
  "2022_BPWSK106": 1,
  "BPWSK106": 1,
  "2022_BICOK107": 1,
  "BICOK107": 1,
  "2022_BPHYS202": 4,
  "BPHYS202": 4,
  "2022_BPOPS203": 3,
  "BPOPS203": 3,
  "2022_BENGK206": 1,
  "BENGK206": 1,
  "2022_BIDTK258": 1,
  "BIDTK258": 1,
  "2022_BMATC101": 4,
  "BMATC101": 4,
  "2022_BPHYC102": 4,
  "BPHYC102": 4,
  "2022_BCIVC103": 3,
  "BCIVC103": 3,
  "2022_BMATC201": 4,
  "BMATC201": 4,
  "2022_BCHEC202": 4,
  "BCHEC202": 4,
  "2022_BCHEC102": 4,
  "BCHEC102": 4,
  "2022_BITDK158": 1,
  "BITDK158": 1,
  "2022_BPHYC202": 4,
  "BPHYC202": 4,
  "2022_BCIVC203": 3,
  "BCIVC203": 3,
  "2022_BMATE101": 4,
  "BMATE101": 4,
  "2022_BPHYE102": 4,
  "BPHYE102": 4,
  "2022_BEEE103": 3,
  "BEEE103": 3,
  "2022_BBEE103": 3,
  "BBEE103": 3,
  "2022_BMATE201": 4,
  "BMATE201": 4,
  "2022_BCHEE202": 4,
  "BCHEE202": 4,
  "2022_BPWKS206": 1,
  "BPWKS206": 1,
  "2022_BESCK201A": 3,
  "BESCK201A": 3,
  "2022_BESCK202B": 3,
  "BESCK202B": 3,
  "2022_BESCK203C": 3,
  "BESCK203C": 3,
  "2022_BESCK205E": 3,
  "BESCK205E": 3,
  "2022_BCHEE102": 4,
  "BCHEE102": 4,
  "2022_BPHYE202": 4,
  "BPHYE202": 4,
  "2022_BEEE203": 3,
  "BEEE203": 3,
  "2022_BBEE203": 3,
  "BBEE203": 3,
  "2022_BMATM101": 4,
  "BMATM101": 4,
  "2022_BPHYM102": 4,
  "BPHYM102": 4,
  "2022_BEMEM103": 3,
  "BEMEM103": 3,
  "2022_BETCK105E": 3,
  "BETCK105E": 3,
  "2022_BMATM201": 4,
  "BMATM201": 4,
  "2022_BCHEM202": 4,
  "BCHEM202": 4,
  "2022_BCHEM102": 4,
  "BCHEM102": 4,
  "2022_BPHYM202": 4,
  "BPHYM202": 4,
  "2022_BEME203": 3,
  "BEME203": 3,
  "2022_BCS301": 4,
  "BCS301": 4,
  "2022_BCS302": 4,
  "BCS302": 4,
  "2022_BCS303": 4,
  "BCS303": 4,
  "2022_BCS304": 3,
  "BCS304": 3,
  "2022_BCSL305": 1,
  "BCSL305": 1,
  "2022_BCS306X": 3,
  "BCS306X": 3,
  "2022_BSCK307": 1,
  "BSCK307": 1,
  "2022_BCS358X": 1,
  "BCS358X": 1,
  "2022_BCS358C": 1,
  "BCS358C": 1,
  "2022_BNSK359": 0,
  "BNSK359": 0,
  "2022_BCS401": 3,
  "BCS401": 3,
  "2022_BCS402": 4,
  "BCS402": 4,
  "2022_BCS403": 4,
  "BCS403": 4,
  "2022_BCSL404": 1,
  "BCSL404": 1,
  "2022_BCS405X": 3,
  "BCS405X": 3,
  "2022_BCS405A": 3,
  "BCS405A": 3,
  "2022_BCS456X": 1,
  "BCS456X": 1,
  "2022_BCS456C": 1,
  "BCS456C": 1,
  "2022_BDSL456C": 1,
  "BDSL456C": 1,
  "2022_BAIL456C": 1,
  "BAIL456C": 1,
  "2022_BBOC407": 2,
  "BBOC407": 2,
  "2022_BUHK408": 1,
  "BUHK408": 1,
  "2022_BNSK459": 0,
  "BNSK459": 0,
  "2022_BCS501": 3,
  "BCS501": 3,
  "2022_BCS502": 4,
  "BCS502": 4,
  "2022_BCS503": 4,
  "BCS503": 4,
  "2022_BCSL504": 1,
  "BCSL504": 1,
  "2022_BCS515X": 3,
  "BCS515X": 3,
  "2022_BCS515B": 3,
  "BCS515B": 3,
  "2022_BCS586": 2,
  "BCS586": 2,
  "2022_BRMK557": 3,
  "BRMK557": 3,
  "2022_BCS508": 1,
  "BCS508": 1,
  "2022_BNSK559": 0,
  "BNSK559": 0,
  "2022_BCS601": 4,
  "BCS601": 4,
  "2022_BCS602": 4,
  "BCS602": 4,
  "2022_BXX613X": 3,
  "BXX613X": 3,
  "2022_BCS613B": 3,
  "BCS613B": 3,
  "2022_BXX654X": 3,
  "BXX654X": 3,
  "2022_BEE654B": 3,
  "BEE654B": 3,
  "2022_BCS685": 2,
  "BCS685": 2,
  "2022_BCSL606": 1,
  "BCSL606": 1,
  "2022_BXX657X": 1,
  "BXX657X": 1,
  "2022_BAIL657C": 1,
  "BAIL657C": 1,
  "2022_BDSL657C": 1,
  "BDSL657C": 1,
  "2022_BNSK658": 0,
  "BNSK658": 0,
  "2022_BIKS609": 1,
  "BIKS609": 1,
  "2022_BCS701": 4,
  "BCS701": 4,
  "2022_BCS702": 4,
  "BCS702": 4,
  "2022_BCS703": 4,
  "BCS703": 4,
  "2022_BCS714X": 3,
  "BCS714X": 3,
  "2022_BCS755X": 3,
  "BCS755X": 3,
  "2022_BCS786": 6,
  "BCS786": 6,
  "2022_BCS801X": 3,
  "BCS801X": 3,
  "2022_BCS802X": 3,
  "BCS802X": 3,
  "2022_BCS803": 10,
  "BCS803": 10,
  "2022_BXX306X": 3,
  "BXX306X": 3,
  "2022_BXX358X": 1,
  "BXX358X": 1,
  "2022_BAD402": 4,
  "BAD402": 4,
  "2022_BXX405X": 3,
  "BXX405X": 3,
  "2022_BDS456X": 1,
  "BDS456X": 1,
  "2022_BAIL504": 1,
  "BAIL504": 1,
  "2022_BXX515X": 3,
  "BXX515X": 3,
  "2022_BAI586": 2,
  "BAI586": 2,
  "2022_BAI601": 4,
  "BAI601": 4,
  "2022_BAI602": 4,
  "BAI602": 4,
  "2022_BAI685": 2,
  "BAI685": 2,
  "2022_BAIL606": 1,
  "BAIL606": 1,
  "2022_BAI701": 4,
  "BAI701": 4,
  "2022_BAI702": 4,
  "BAI702": 4,
  "2022_BAD703": 4,
  "BAD703": 4,
  "2022_BAI714X": 3,
  "BAI714X": 3,
  "2022_BAI755X": 3,
  "BAI755X": 3,
  "2022_BAI786": 6,
  "BAI786": 6,
  "2022_BAI801X": 3,
  "BAI801X": 3,
  "2022_BAI802X": 3,
  "BAI802X": 3,
  "2022_BAI803": 10,
  "BAI803": 10,
  "2022_BCD586": 2,
  "BCD586": 2,
  "2022_BAD601": 4,
  "BAD601": 4,
  "2022_BDS602": 4,
  "BDS602": 4,
  "2022_BCD685": 2,
  "BCD685": 2,
  "2022_BDS701": 4,
  "BDS701": 4,
  "2022_BAD702": 4,
  "BAD702": 4,
  "2022_BCD714X": 3,
  "BCD714X": 3,
  "2022_BCD755X": 3,
  "BCD755X": 3,
  "2022_BCD786": 6,
  "BCD786": 6,
  "2022_BCD801X": 3,
  "BCD801X": 3,
  "2022_BCD802X": 3,
  "BCD802X": 3,
  "2022_BCD803": 10,
  "BCD803": 10,
  "2022_BCV301": 3,
  "BCV301": 3,
  "2022_BCV302": 4,
  "BCV302": 4,
  "2022_BCV303": 4,
  "BCV303": 4,
  "2022_BCV304": 3,
  "BCV304": 3,
  "2022_BCV305": 1,
  "BCV305": 1,
  "2022_BCV306X": 3,
  "BCV306X": 3,
  "2022_BCV358X": 1,
  "BCV358X": 1,
  "2022_BCV401": 3,
  "BCV401": 3,
  "2022_BCV402": 4,
  "BCV402": 4,
  "2022_BCV403": 4,
  "BCV403": 4,
  "2022_BCVL404": 1,
  "BCVL404": 1,
  "2022_BCV405X": 3,
  "BCV405X": 3,
  "2022_BCV456X": 1,
  "BCV456X": 1,
  "2022_BBOK407": 3,
  "BBOK407": 3,
  "2022_BCV501": 3,
  "BCV501": 3,
  "2022_BCV502": 4,
  "BCV502": 4,
  "2022_BCV503": 4,
  "BCV503": 4,
  "2022_BCV504": 1,
  "BCV504": 1,
  "2022_BCV515X": 3,
  "BCV515X": 3,
  "2022_BCV586": 2,
  "BCV586": 2,
  "2022_BESK508": 2,
  "BESK508": 2,
  "2022_BCV601": 4,
  "BCV601": 4,
  "2022_BCV602": 4,
  "BCV602": 4,
  "2022_BCV613X": 3,
  "BCV613X": 3,
  "2022_BCV654X": 3,
  "BCV654X": 3,
  "2022_BCV685": 2,
  "BCV685": 2,
  "2022_BCVL606": 1,
  "BCVL606": 1,
  "2022_BCV657X": 1,
  "BCV657X": 1,
  "2022_BCV701": 4,
  "BCV701": 4,
  "2022_BCV702": 4,
  "BCV702": 4,
  "2022_BCV703": 4,
  "BCV703": 4,
  "2022_BCV714X": 3,
  "BCV714X": 3,
  "2022_BCV755X": 3,
  "BCV755X": 3,
  "2022_BCV786": 6,
  "BCV786": 6,
  "2022_BCV801X": 3,
  "BCV801X": 3,
  "2022_BCV802X": 3,
  "BCV802X": 3,
  "2022_BCV803": 10,
  "BCV803": 10,
  "2022_BMATEC301": 3,
  "BMATEC301": 3,
  "2022_BEC302": 4,
  "BEC302": 4,
  "2022_BEC303": 4,
  "BEC303": 4,
  "2022_BEC304": 3,
  "BEC304": 3,
  "2022_BECL305": 1,
  "BECL305": 1,
  "2022_BEC401": 3,
  "BEC401": 3,
  "2022_BEC402": 4,
  "BEC402": 4,
  "2022_BEC403": 4,
  "BEC403": 4,
  "2022_BECL404": 1,
  "BECL404": 1,
  "2022_BEC405X": 3,
  "BEC405X": 3,
  "2022_BXX456X": 1,
  "BXX456X": 1,
  "2022_BEC501": 3,
  "BEC501": 3,
  "2022_BEC502": 4,
  "BEC502": 4,
  "2022_BEC503": 4,
  "BEC503": 4,
  "2022_BECL504": 1,
  "BECL504": 1,
  "2022_BEC515X": 3,
  "BEC515X": 3,
  "2022_BEC586": 2,
  "BEC586": 2,
  "2022_BEC601": 4,
  "BEC601": 4,
  "2022_BEC602": 4,
  "BEC602": 4,
  "2022_BEC613X": 3,
  "BEC613X": 3,
  "2022_BEC654X": 3,
  "BEC654X": 3,
  "2022_BEC685": 2,
  "BEC685": 2,
  "2022_BECL606": 1,
  "BECL606": 1,
  "2022_BEC657X": 1,
  "BEC657X": 1,
  "2022_BEC701": 4,
  "BEC701": 4,
  "2022_BEC702": 4,
  "BEC702": 4,
  "2022_BEC703": 4,
  "BEC703": 4,
  "2022_BEC714X": 3,
  "BEC714X": 3,
  "2022_BEC755X": 3,
  "BEC755X": 3,
  "2022_BEC786": 6,
  "BEC786": 6,
  "2022_BEC801X": 3,
  "BEC801X": 3,
  "2022_BEC802X": 3,
  "BEC802X": 3,
  "2022_BEC803": 10,
  "BEC803": 10,
  "2022_BXX601": 4,
  "BXX601": 4,
  "2022_BXX602": 4,
  "BXX602": 4,
  "2022_BXXL606": 1,
  "BXXL606": 1,
  "2022_BXX701": 4,
  "BXX701": 4,
  "2022_BXX702": 4,
  "BXX702": 4,
  "2022_BXX703": 3,
  "BXX703": 3,
  "2022_BXX714X": 3,
  "BXX714X": 3,
  "2022_BXX755X": 3,
  "BXX755X": 3,
  "2022_BXX801X": 3,
  "BXX801X": 3,
  "2022_BXX802X": 3,
  "BXX802X": 3,
  "2022_BXX883": 9,
  "BXX883": 9,
  "2022_BXX804": 10,
  "BXX804": 10,
  "2022_BEE301": 3,
  "BEE301": 3,
  "2022_BEE302": 4,
  "BEE302": 4,
  "2022_BEE303": 4,
  "BEE303": 4,
  "2022_BEE304": 3,
  "BEE304": 3,
  "2022_BEEL305": 1,
  "BEEL305": 1,
  "2022_BEE306X": 3,
  "BEE306X": 3,
  "2022_BEE358X": 1,
  "BEE358X": 1,
  "2022_BEE401": 3,
  "BEE401": 3,
  "2022_BEE402": 4,
  "BEE402": 4,
  "2022_BEE403": 4,
  "BEE403": 4,
  "2022_BEEL404": 1,
  "BEEL404": 1,
  "2022_BEE405X": 3,
  "BEE405X": 3,
  "2022_BEE456X": 1,
  "BEE456X": 1,
  "2022_BEE501": 3,
  "BEE501": 3,
  "2022_BEE502": 4,
  "BEE502": 4,
  "2022_BEE503": 4,
  "BEE503": 4,
  "2022_BEEL504": 1,
  "BEEL504": 1,
  "2022_BEE515X": 3,
  "BEE515X": 3,
  "2022_BEE586": 2,
  "BEE586": 2,
  "2022_BEE601": 4,
  "BEE601": 4,
  "2022_BEE602": 4,
  "BEE602": 4,
  "2022_BEE613X": 3,
  "BEE613X": 3,
  "2022_BEE654X": 3,
  "BEE654X": 3,
  "2022_BEE685": 2,
  "BEE685": 2,
  "2022_BEEL606": 1,
  "BEEL606": 1,
  "2022_BEE657X": 1,
  "BEE657X": 1,
  "2022_BEE701": 4,
  "BEE701": 4,
  "2022_BEE702": 4,
  "BEE702": 4,
  "2022_BEE703": 4,
  "BEE703": 4,
  "2022_BEE714X": 3,
  "BEE714X": 3,
  "2022_BEE755X": 3,
  "BEE755X": 3,
  "2022_BEE786": 6,
  "BEE786": 6,
  "2022_BEE801X": 3,
  "BEE801X": 3,
  "2022_BEE802X": 3,
  "BEE802X": 3,
  "2022_BEE803": 10,
  "BEE803": 10,
  "2022_BME301": 3,
  "BME301": 3,
  "2022_BME302": 4,
  "BME302": 4,
  "2022_BME303": 4,
  "BME303": 4,
  "2022_BME304": 3,
  "BME304": 3,
  "2022_BME306X": 3,
  "BME306X": 3,
  "2022_BME358X": 1,
  "BME358X": 1,
  "2022_BME401": 3,
  "BME401": 3,
  "2022_BME402": 4,
  "BME402": 4,
  "2022_BME403": 4,
  "BME403": 4,
  "2022_BME404": 1,
  "BME404": 1,
  "2022_BME405X": 3,
  "BME405X": 3,
  "2022_BME456X": 1,
  "BME456X": 1,
  "2022_BME501": 3,
  "BME501": 3,
  "2022_BME502": 4,
  "BME502": 4,
  "2022_BME503": 4,
  "BME503": 4,
  "2022_BME504L": 1,
  "BME504L": 1,
  "2022_BME515X": 3,
  "BME515X": 3,
  "2022_BME586": 2,
  "BME586": 2,
  "2022_BME601": 4,
  "BME601": 4,
  "2022_BME602": 4,
  "BME602": 4,
  "2022_BME613X": 3,
  "BME613X": 3,
  "2022_BME654X": 3,
  "BME654X": 3,
  "2022_BME685": 2,
  "BME685": 2,
  "2022_BMEL606L": 1,
  "BMEL606L": 1,
  "2022_BME657X": 1,
  "BME657X": 1,
  "2022_BME701": 4,
  "BME701": 4,
  "2022_BME702": 4,
  "BME702": 4,
  "2022_BME703": 4,
  "BME703": 4,
  "2022_BME714X": 3,
  "BME714X": 3,
  "2022_BME755X": 3,
  "BME755X": 3,
  "2022_BME786": 6,
  "BME786": 6,
  "2022_BRI301": 3,
  "BRI301": 3,
  "2022_BRI302": 4,
  "BRI302": 4,
  "2022_BRI303": 4,
  "BRI303": 4,
  "2022_BRI304": 3,
  "BRI304": 3,
  "2022_BRI306X": 3,
  "BRI306X": 3,
  "2022_BRI358X": 1,
  "BRI358X": 1,
  "2022_BRI358A": 1,
  "BRI358A": 1,
  "2022_BRI358B": 1,
  "BRI358B": 1,
  "2022_BRI401": 3,
  "BRI401": 3,
  "2022_BRI402": 4,
  "BRI402": 4,
  "2022_BRI403": 4,
  "BRI403": 4,
  "2022_BRIL404": 1,
  "BRIL404": 1,
  "2022_BRI405X": 3,
  "BRI405X": 3,
  "2022_BRI456X": 1,
  "BRI456X": 1,
  "2022_BRI456A": 1,
  "BRI456A": 1,
  "2022_BRI501": 3,
  "BRI501": 3,
  "2022_BRI502": 4,
  "BRI502": 4,
  "2022_BRI503": 4,
  "BRI503": 4,
  "2022_BRIL504": 1,
  "BRIL504": 1,
  "2022_BRI515X": 3,
  "BRI515X": 3,
  "2022_BRI586": 2,
  "BRI586": 2,
  "2022_BRI601": 4,
  "BRI601": 4,
  "2022_BRI602": 4,
  "BRI602": 4,
  "2022_BRI613X": 3,
  "BRI613X": 3,
  "2022_BRI654X": 3,
  "BRI654X": 3,
  "2022_BRI685": 2,
  "BRI685": 2,
  "2022_BRIL606": 1,
  "BRIL606": 1,
  "2022_BRI657X": 1,
  "BRI657X": 1,
  "2022_BRI613A": 4,
  "BRI613A": 4,
  "2022_BRI701": 4,
  "BRI701": 4,
  "2022_BRI702": 4,
  "BRI702": 4,
  "2022_BRI703": 4,
  "BRI703": 4,
  "2022_BRI714X": 3,
  "BRI714X": 3,
  "2022_BRI755X": 3,
  "BRI755X": 3,
  "2022_BRI786": 6,
  "BRI786": 6,
  "2022_BRI811X": 3,
  "BRI811X": 3,
  "2022_BRI852X": 3,
  "BRI852X": 3,
  "2022_BRI883": 10,
  "BRI883": 10,
  "2025_1BMATX101": 4,
  "1BMATX101": 4,
  "2025_1BPHYX102": 4,
  "1BPHYX102": 4,
  "2025_1BCEDX103": 3,
  "1BCEDX103": 3,
  "2025_1BXXX104X": 3,
  "1BXXX104X": 3,
  "2025_1BXXX105X": 3,
  "1BXXX105X": 3,
  "2025_1BSKS106": 1,
  "1BSKS106": 1,
  "2025_1BXXXL107X": 1,
  "1BXXXL107X": 1,
  "2025_1BIDTL158": 1,
  "1BIDTL158": 1,
  "2025_1BMATC101": 2,
  "1BMATC101": 2,
  "2025_1BMATM101": 2,
  "1BMATM101": 2,
  "2025_1BMATE101": 2,
  "1BMATE101": 2,
  "2025_1BMATS101": 2,
  "1BMATS101": 2,
  "2025_1BPHYS102": 2,
  "1BPHYS102": 2,
  "2025_1BCEDC103": 3,
  "1BCEDC103": 3,
  "2025_1BCEDM103": 3,
  "1BCEDM103": 3,
  "2025_1BCEDEC103": 3,
  "1BCEDEC103": 3,
  "2025_1BCEDE103": 3,
  "1BCEDE103": 3,
  "2025_1BCEDS103": 3,
  "1BCEDS103": 3,
  "2025_1BCIV105": 2,
  "1BCIV105": 2,
  "2025_1BBEE105": 2,
  "1BBEE105": 2,
  "2025_1BECE105": 2,
  "1BECE105": 2,
  "2025_1BEME105": 2,
  "1BEME105": 2,
  "2025_1BEIT105": 2,
  "1BEIT105": 2,
  "2025_1BEBT105": 2,
  "1BEBT105": 2,
  "2025_1BSSA105": 2,
  "1BSSA105": 2,
  "2025_1BEAE105": 2,
  "1BEAE105": 2,
  "2025_1BECHE105": 2,
  "1BECHE105": 2,
  "2025_1BETX105": 2,
  "1BETX105": 2,
  "2025_1BMATX201": 4,
  "1BMATX201": 4,
  "2025_1BCHEX202": 4,
  "1BCHEX202": 4,
  "2025_1BAIA203": 3,
  "1BAIA203": 3,
  "2025_1BESC204X": 3,
  "1BESC204X": 3,
  "2025_1BPLC205X": 4,
  "1BPLC205X": 4,
  "2025_1BENG206": 1,
  "1BENG206": 1,
  "2025_1BICO207": 1,
  "1BICO207": 1,
  "2025_1BPRJ258": 1,
  "1BPRJ258": 1,
  "2025_1BMATC201": 2,
  "1BMATC201": 2,
  "2025_1BMATM201": 2,
  "1BMATM201": 2,
  "2025_1BMATE201": 2,
  "1BMATE201": 2,
  "2025_1BMATS201": 2,
  "1BMATS201": 2,
  "2025_1BESC204A": 2,
  "1BESC204A": 2,
  "2025_1BESC204B": 2,
  "1BESC204B": 2,
  "2025_1BESC204C": 3,
  "1BESC204C": 3,
  "2025_1BESC204D": 3,
  "1BESC204D": 3,
  "2025_1BESC204E": 3,
  "1BESC204E": 3,
  "2025_1BCHEX102": 4,
  "1BCHEX102": 4,
  "2025_1BAIA103": 3,
  "1BAIA103": 3,
  "2025_1BESC104X": 3,
  "1BESC104X": 3,
  "2025_1BPLC105X": 4,
  "1BPLC105X": 4,
  "2025_1BENG106": 1,
  "1BENG106": 1,
  "2025_1BICO107": 1,
  "1BICO107": 1,
  "2025_1BESC104A": 3,
  "1BESC104A": 3,
  "2025_1BESC104B": 3,
  "1BESC104B": 3,
  "2025_1BESC104C": 3,
  "1BESC104C": 3,
  "2025_1BESC104D": 3,
  "1BESC104D": 3,
  "2025_1BESC104E": 3,
  "1BESC104E": 3,
  "2025_1BPHYX202": 4,
  "1BPHYX202": 4,
  "2025_1BCEDX203": 3,
  "1BCEDX203": 3,
  "2025_1BXXX204X": 3,
  "1BXXX204X": 3,
  "2025_1BXXX205X": 3,
  "1BXXX205X": 3,
  "2025_1BSKS206": 1,
  "1BSKS206": 1,
  "2025_1BXXXL207X": 1,
  "1BXXXL207X": 1,
  "2025_1BPHYS202": 2,
  "1BPHYS202": 2,
  "2025_1BCIV205": 2,
  "1BCIV205": 2,
  "2025_1BEME205": 2,
  "1BEME205": 2,
  "2025_1BBEE205": 2,
  "1BBEE205": 2,
  "2025_1BECE205": 2,
  "1BECE205": 2,
  "2025_1BEIT205": 2,
  "1BEIT205": 2,
  "2025_1BEBT205": 2,
  "1BEBT205": 2,
  "2025_1BSSA205": 2,
  "1BSSA205": 2,
  "2025_1BEAE205": 2,
  "1BEAE205": 2,
  "2025_1BECHE205": 2,
  "1BECHE205": 2,
  "2025_1BETX205": 2,
  "1BETX205": 2,
  "2025_1BCEDS203": 2,
  "1BCEDS203": 2,
  "2025_1BMATCS301": 4,
  "1BMATCS301": 4,
  "2025_1BCS302": 4,
  "1BCS302": 4,
  "2025_1BCS303": 4,
  "1BCS303": 4,
  "2025_1BCS304": 3,
  "1BCS304": 3,
  "2025_1BCS305": 3,
  "1BCS305": 3,
  "2025_1BCSL306": 1,
  "1BCSL306": 1,
  "2025_1BCSL307A": 1,
  "1BCSL307A": 1,
  "2025_1BCP308": 1,
  "1BCP308": 1,
  "2025_1BNSS309": 0,
  "1BNSS309": 9,
  "2025_1BMATDIP310": 3,
  "1BMATDIP310": 3,
  "2025_1BCS401": 4,
  "1BCS401": 4,
  "2025_1BCS402": 4,
  "1BCS402": 4,
  "2025_1BCS403": 4,
  "1BCS403": 4,
  "2025_1BCS404": 4,
  "1BCS404": 4,
  "2025_1BCSL405": 1,
  "1BCSL405": 1,
  "2025_1BXXL406X": 1,
  "1BXXL406X": 1,
  "2025_1BCS407": 2,
  "1BCS407": 2,
  "2025_1BEP408": 1,
  "1BEP408": 1,
  "2025_1BNSK409": 0,
  "1BNSK409": 0,
  "2025_1BMATDIP410": 14,
  "1BMATDIP410": 14,
  "2025_1BCS501": 3,
  "1BCS501": 3,
  "2025_1BCS502": 4,
  "1BCS502": 4,
  "2025_1BCS503": 4,
  "1BCS503": 4,
  "2025_1BCS504": 3,
  "1BCS504": 3,
  "2025_1BXX505X": 3,
  "1BXX505X": 3,
  "2025_1BRM506": 2,
  "1BRM506": 2,
  "2025_1BCSL507": 1,
  "1BCSL507": 1,
  "2025_1BCS508": 2,
  "1BCS508": 2,
  "2025_1BCS601": 4,
  "1BCS601": 4,
  "2025_1BCS602": 3,
  "1BCS602": 3,
  "2025_1BCS603": 3,
  "1BCS603": 3,
  "2025_1BCS604": 3,
  "1BCS604": 3,
  "2025_1BXX605X": 3,
  "1BXX605X": 3,
  "2025_1BCSL606": 1,
  "1BCSL606": 1,
  "2025_1BXXL607X": 1,
  "1BXXL607X": 1,
  "2025_1BCS608": 3,
  "1BCS608": 3,
  "2025_1BXX609": 9,
  "1BXX609": 9,
  "2025_1BCS701": 4,
  "1BCS701": 4,
  "2025_1BXX702X": 3,
  "1BXX702X": 3,
  "2025_1BXX703X": 3,
  "1BXX703X": 3,
  "2025_1BXX704X": 3,
  "1BXX704X": 3,
  "2025_1BCS705": 7,
  "1BCS705": 7,
  "2025_1BIKS706": 1,
  "1BIKS706": 1,
  "2025_1BXX801X": 3,
  "1BXX801X": 3,
  "2025_1BXX802X": 3,
  "1BXX802X": 3,
  "2025_1BXX803X": 9,
  "1BXX803X": 9,
  "2025_1BXXL307X": 1,
  "1BXXL307X": 1,
  "2025_1BAI401": 4,
  "1BAI401": 4,
  "2025_1BAI402": 4,
  "1BAI402": 4,
  "2025_1BAI403": 4,
  "1BAI403": 4,
  "2025_1BAI404": 4,
  "1BAI404": 4,
  "2025_1BAIL405": 1,
  "1BAIL405": 1,
  "2025_1BAI502": 4,
  "1BAI502": 4,
  "2025_1BAI504": 3,
  "1BAI504": 3,
  "2025_1BAIL507": 1,
  "1BAIL507": 1,
  "2025_1BAI508": 2,
  "1BAI508": 2,
  "2025_1BIS602": 3,
  "1BIS602": 3,
  "2025_1BAI603": 3,
  "1BAI603": 3,
  "2025_1BAI604": 3,
  "1BAI604": 3,
  "2025_1BAIL606": 1,
  "1BAIL606": 1,
  "2025_1BAI608": 3,
  "1BAI608": 3,
  "2025_1BAD701": 4,
  "1BAD701": 4,
  "2025_1BAI705": 7,
  "1BAI705": 7,
  "2025_1BCG504": 3,
  "1BCG504": 3,
  "2025_1BCGL507": 1,
  "1BCGL507": 1,
  "2025_1BCG508": 2,
  "1BCG508": 2,
  "2025_1BCG603": 3,
  "1BCG603": 3,
  "2025_1BCG608": 3,
  "1BCG608": 3,
  "2025_1BCG701": 4,
  "1BCG701": 4,
  "2025_1BCG705": 7,
  "1BCG705": 7,
  "2025_1BCV302": 4,
  "1BCV302": 4,
  "2025_1BCV303": 4,
  "1BCV303": 4,
  "2025_1BCV304": 3,
  "1BCV304": 3,
  "2025_1BCV305": 3,
  "1BCV305": 3,
  "2025_1BCVL306": 1,
  "1BCVL306": 1,
  "2025_1BCVL307X": 1,
  "1BCVL307X": 1,
  "2025_1BCV401": 3,
  "1BCV401": 3,
  "2025_1BCV402": 4,
  "1BCV402": 4,
  "2025_1BCV403": 4,
  "1BCV403": 4,
  "2025_1BCV404": 3,
  "1BCV404": 3,
  "2025_1BCVL405": 1,
  "1BCVL405": 1,
  "2025_1BCVL406": 1,
  "1BCVL406": 1,
  "2025_1BCV407": 2,
  "1BCV407": 2,
  "2025_1BCV409": 3,
  "1BCV409": 3,
  "2025_1BCV501": 3,
  "1BCV501": 3,
  "2025_1BCV502": 4,
  "1BCV502": 4,
  "2025_1BCV503": 3,
  "1BCV503": 3,
  "2025_1BCV504": 3,
  "1BCV504": 3,
  "2025_1BXXL507": 1,
  "1BXXL507": 1,
  "2025_1BXX508": 2,
  "1BXX508": 2,
  "2025_1BCV601": 4,
  "1BCV601": 4,
  "2025_1BCV602": 3,
  "1BCV602": 3,
  "2025_1BCV603": 3,
  "1BCV603": 3,
  "2025_1BCV604": 3,
  "1BCV604": 3,
  "2025_1BCV605X": 3,
  "1BCV605X": 3,
  "2025_1BCVL606": 1,
  "1BCVL606": 1,
  "2025_1BCVL607X": 1,
  "1BCVL607X": 1,
  "2025_1BCV608": 3,
  "1BCV608": 3,
  "2025_1BUHV609": 14,
  "1BUHV609": 14,
  "2025_1BCV701": 4,
  "1BCV701": 4,
  "2025_1BCV702X": 3,
  "1BCV702X": 3,
  "2025_1BCV703X": 3,
  "1BCV703X": 3,
  "2025_1BCV704X": 3,
  "1BCV704X": 3,
  "2025_1BCV705": 7,
  "1BCV705": 7,
  "2025_1BCV801X": 3,
  "1BCV801X": 3,
  "2025_1BCV802X": 3,
  "1BCV802X": 3,
  "2025_1BCV803X": 9,
  "1BCV803X": 9,
  "2025_1BMATEC301": 4,
  "1BMATEC301": 4,
  "2025_1BEC302": 4,
  "1BEC302": 4,
  "2025_1BEC303": 4,
  "1BEC303": 4,
  "2025_1BEC304": 3,
  "1BEC304": 3,
  "2025_1BEC305": 3,
  "1BEC305": 3,
  "2025_1BECL306": 1,
  "1BECL306": 1,
  "2025_1BECL307X": 1,
  "1BECL307X": 1,
  "2025_1BMATEC401": 3,
  "1BMATEC401": 3,
  "2025_1BEC402": 4,
  "1BEC402": 4,
  "2025_1BEC403": 4,
  "1BEC403": 4,
  "2025_1BEC404": 3,
  "1BEC404": 3,
  "2025_1BECL405": 1,
  "1BECL405": 1,
  "2025_1BECL406": 1,
  "1BECL406": 1,
  "2025_1BEC407": 2,
  "1BEC407": 2,
  "2025_1BEC409": 9,
  "1BEC409": 9,
  "2025_1BEC501": 3,
  "1BEC501": 3,
  "2025_1BEC502": 4,
  "1BEC502": 4,
  "2025_1BEC503": 3,
  "1BEC503": 3,
  "2025_1BEC504": 3,
  "1BEC504": 3,
  "2025_1BEC505X": 3,
  "1BEC505X": 3,
  "2025_1BECL507": 1,
  "1BECL507": 1,
  "2025_1BEC508": 2,
  "1BEC508": 2,
  "2025_1BEC601": 4,
  "1BEC601": 4,
  "2025_1BEC602": 3,
  "1BEC602": 3,
  "2025_1BEC603": 3,
  "1BEC603": 3,
  "2025_1BEC604": 3,
  "1BEC604": 3,
  "2025_1BEC605X": 3,
  "1BEC605X": 3,
  "2025_1BECL606": 1,
  "1BECL606": 1,
  "2025_1BECL607X": 1,
  "1BECL607X": 1,
  "2025_1BEC608": 3,
  "1BEC608": 3,
  "2025_1BEC609": 14,
  "1BEC609": 14,
  "2025_1BEC701": 4,
  "1BEC701": 4,
  "2025_1BEC702X": 3,
  "1BEC702X": 3,
  "2025_1BEC703X": 3,
  "1BEC703X": 3,
  "2025_1BEC704X": 3,
  "1BEC704X": 3,
  "2025_1BEC705": 7,
  "1BEC705": 7,
  "2025_1BEC801X": 3,
  "1BEC801X": 3,
  "2025_1BEC802X": 3,
  "1BEC802X": 3,
  "2025_1BEC803X": 9,
  "1BEC803X": 9,
  "2025_1BMATEE301": 4,
  "1BMATEE301": 4,
  "2025_1BEE302": 4,
  "1BEE302": 4,
  "2025_1BEE303": 4,
  "1BEE303": 4,
  "2025_1BEE304": 3,
  "1BEE304": 3,
  "2025_1BEE305": 3,
  "1BEE305": 3,
  "2025_1BEEL306": 1,
  "1BEEL306": 1,
  "2025_1BEEL307X": 1,
  "1BEEL307X": 1,
  "2025_1BEE401": 3,
  "1BEE401": 3,
  "2025_1BEE402": 4,
  "1BEE402": 4,
  "2025_1BEE403": 4,
  "1BEE403": 4,
  "2025_1BEE404": 3,
  "1BEE404": 3,
  "2025_1BEEL405": 1,
  "1BEEL405": 1,
  "2025_1BEEL406": 1,
  "1BEEL406": 1,
  "2025_1BEE407": 2,
  "1BEE407": 2,
  "2025_1BEE409": 3,
  "1BEE409": 3,
  "2025_1BNSS409": 0,
  "1BNSS409": 10,
  "2025_1BMATM301": 4,
  "1BMATM301": 4,
  "2025_1BME302": 4,
  "1BME302": 4,
  "2025_1BME303": 3,
  "1BME303": 3,
  "2025_1BME304": 3,
  "1BME304": 3,
  "2025_1BME305": 3,
  "1BME305": 3,
  "2025_1BMEL306": 2,
  "1BMEL306": 2,
  "2025_1BMEL307X": 1,
  "1BMEL307X": 1,
  "2025_1BMATM401": 3,
  "1BMATM401": 3,
  "2025_1BME402": 4,
  "1BME402": 4,
  "2025_1BME403": 4,
  "1BME403": 4,
  "2025_1BME404": 3,
  "1BME404": 3,
  "2025_1BMEL405": 1,
  "1BMEL405": 1,
  "2025_1BMEL406X": 1,
  "1BMEL406X": 1,
  "2025_1BME407": 2,
  "1BME407": 2,
  "2025_1BME409": 3,
  "1BME409": 3,
  "2025_1BRI301": 4,
  "1BRI301": 4,
  "2025_1BRI302": 4,
  "1BRI302": 4,
  "2025_1BRI303": 4,
  "1BRI303": 4,
  "2025_1BRI304": 3,
  "1BRI304": 3,
  "2025_1BRI305": 3,
  "1BRI305": 3,
  "2025_1BRIL306": 1,
  "1BRIL306": 1,
  "2025_1BRIL307": 1,
  "1BRIL307": 1,
  "2025_1BRI401": 3,
  "1BRI401": 3,
  "2025_1BRI402": 4,
  "1BRI402": 4,
  "2025_1BRI403": 4,
  "1BRI403": 4,
  "2025_1BRI404": 3,
  "1BRI404": 3,
  "2025_1BRIL405": 1,
  "1BRIL405": 1,
  "2025_1BRIL406": 1,
  "1BRIL406": 1,
  "2025_1BRI407": 2,
  "1BRI407": 2,
  "2025_1BRI409": 3,
  "1BRI409": 3,
  "2025_1BMAT301": 4,
  "1BMAT301": 4,
  "2025_1BXX302": 4,
  "1BXX302": 4,
  "2025_1BXX303": 4,
  "1BXX303": 4,
  "2025_1BXX304": 3,
  "1BXX304": 3,
  "2025_1BXX305": 3,
  "1BXX305": 3,
  "2025_1BXXL306": 1,
  "1BXXL306": 1,
  "2025_1BXX401": 3,
  "1BXX401": 3,
  "2025_1BXX402": 4,
  "1BXX402": 4,
  "2025_1BXX403": 4,
  "1BXX403": 4,
  "2025_1BXX404": 3,
  "1BXX404": 3,
  "2025_1BXXL405": 1,
  "1BXXL405": 1,
  "2025_1BXXL406": 1,
  "1BXXL406": 1,
  "2025_1BXX407": 2,
  "1BXX407": 2,
  "2025_1BXX409": 3,
  "1BXX409": 3,
  "2025_1BXX501": 3,
  "1BXX501": 3,
  "2025_1BXX502": 4,
  "1BXX502": 4,
  "2025_1BXX503": 3,
  "1BXX503": 3,
  "2025_1BXX504": 3,
  "1BXX504": 3,
  "2025_1BXX601": 4,
  "1BXX601": 4,
  "2025_1BXX602": 3,
  "1BXX602": 3,
  "2025_1BXX603": 3,
  "1BXX603": 3,
  "2025_1BXX604": 3,
  "1BXX604": 3,
  "2025_1BXXL606": 1,
  "1BXXL606": 1,
  "2025_1BXX608": 3,
  "1BXX608": 3,
  "2025_1BXX701": 4,
  "1BXX701": 4,
  "2025_1BXX705": 7,
  "1BXX705": 7,
  "BPEK359": 0,
  "2022_BPEK359": 0,
  "BPEK459": 0,
  "2022_BPEK459": 0,
  "BPEK559": 0,
  "2022_BPEK559": 0,
  "BPEK658": 0,
  "2022_BPEK658": 0,
  "BYOK359": 0,
  "2022_BYOK359": 0,
  "BYOK459": 0,
  "2022_BYOK459": 0,
  "BYOK559": 0,
  "2022_BYOK559": 0,
  "BYOK658": 0,
  "2022_BYOK658": 0,
  "BCS358A": 1,
  "2022_BCS358A": 1,
  "BCS358B": 1,
  "2022_BCS358B": 1,
  "BCS358C": 1,
  "2022_BCS358C": 1,
  "BCS358D": 1,
  "2022_BCS358D": 1,
  "BCS456A": 1,
  "2022_BCS456A": 1,
  "BCS456B": 1,
  "2022_BCS456B": 1,
  "BCS456C": 1,
  "2022_BCS456C": 1,
  "BCS456D": 1,
  "2022_BCS456D": 1,
  "BAIL657A": 1,
  "2022_BAIL657A": 1,
  "BAIL657B": 1,
  "2022_BAIL657B": 1,
  "BAIL657C": 1,
  "2022_BAIL657C": 1,
  "BAIL657D": 1,
  "2022_BAIL657D": 1,
  "BDSL456A": 1,
  "2022_BDSL456A": 1,
  "BDSL456B": 1,
  "2022_BDSL456B": 1,
  "BDSL456C": 1,
  "2022_BDSL456C": 1,
  "BDSL456D": 1,
  "2022_BDSL456D": 1,
  "BKSKK107": 1,
  "2022_BKSKK107": 1,
  "BKSKK207": 1,
  "2022_BKSKK207": 1,
  "BKBKK107": 1,
  "2022_BKBKK107": 1,
  "BKBKK207": 1,
  "2022_BKBKK207": 1,
  "BCS306A": 3,
  "2022_BCS306A": 3,
  "BCS306B": 3,
  "2022_BCS306B": 3,
  "BCS405A": 3,
  "2022_BCS405A": 3,
  "BCS515A": 3,
  "2022_BCS515A": 3,
  "BCS515B": 3,
  "2022_BCS515B": 3,
  "BCS613A": 3,
  "2022_BCS613A": 3,
  "BCS613B": 3,
  "2022_BCS613B": 3,
  "BEE654B": 3,
  "2022_BEE654B": 3
};

export const VTU_OFFICIAL_SUBJECT_DATA = {
  "2022_CS": {
    "1": [
      {
        "code": "BMATS101",
        "name": "Mathematics-I for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPHYS102",
        "name": "Applied Physics for CSE stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPOPS103",
        "name": "Principles of Programming Using C",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK105X",
        "name": "Emerging Technology Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK105X",
        "name": "Programming Languages Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BENGK106",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK158",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK158",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK104A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105H",
        "name": "Introduction to Internet of Things (IOT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BCHES102",
        "name": "Applied Chemistry for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK103",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BPWSK106",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK107",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "2": [
      {
        "code": "BMATS201",
        "name": "Mathematics-II forCSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCHES202",
        "name": "Applied Chemistry for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK203",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK205X",
        "name": "Programming Language Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK205X",
        "name": "Emerging Technology Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPWSK206",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK207",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK258",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "KIDTK258",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205H",
        "name": "Introduction to Internet of Things(IoT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPHYS202",
        "name": "Applied Physics for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPOPS203",
        "name": "Principles of Programming Using C",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BENGK206",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK258",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "3": [
      {
        "code": "BCS301",
        "name": "Mathematics for Computer Science",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCS302",
        "name": "Digital Design & Computer Organization",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS303",
        "name": "Operating Systems",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS304",
        "name": "Data Structures and Applications",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCSL305",
        "name": "Data Structures Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BCS306X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BSCK307",
        "name": "Social Connect and Responsibility",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BCS358X",
        "name": "Ability Enhancement Course/Skill Enhancement Course - III",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BNSK359",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "4": [
      {
        "code": "BCS401",
        "name": "Analysis & Design of Algorithms",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCS402",
        "name": "Microcontrollers",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS403",
        "name": "Database Management Systems",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCSL404",
        "name": "Analysis & Design of Algorithms Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BCS405X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BCS456X",
        "name": "Ability Enhancement Course/Skill Enhancement Course- IV",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BBOC407",
        "name": "Biology for Computer Engineers",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "BUHK408",
        "name": "Universal human values course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BNSK459",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "BCS501",
        "name": "Software Engineering & Project Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCS502",
        "name": "Computer Networks",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS503",
        "name": "Theory of Computation",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCSL504",
        "name": "Web Technology Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BCS515X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BCS586",
        "name": "Mini Project",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BRMK557",
        "name": "Research Methodology and IPR",
        "credits": 3,
        "course_type": "AEC"
      },
      {
        "code": "BCS508",
        "name": "Environmental Studies and E-waste Management",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BNSK559",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "6": [
      {
        "code": "BCS601",
        "name": "Cloud Computing (Open Stack /Google)",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS602",
        "name": "Machine Learning",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BXX613X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BXX654X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BCS685",
        "name": "Project Phase I",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BCSL606",
        "name": "Machine Learning lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BXX657X",
        "name": "Ability Enhancement Course/Skill Development Course V",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK658",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "BIKS609",
        "name": "Indian Knowledge System",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "7": [
      {
        "code": "BCS701",
        "name": "Internet of Things",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS702",
        "name": "Parallel Computing",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS703",
        "name": "Cryptography & Network Security",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCS714X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BCS755X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BCS786",
        "name": "Major Project Phase-II",
        "credits": 6,
        "course_type": "PROJ"
      }
    ],
    "8": [
      {
        "code": "BCS801X",
        "name": "Professional Elective (Online Courses) Only through NPTEL",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BCS802X",
        "name": "Open Elective (Online Courses) Only through NPTEL",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BCS803",
        "name": "Internship (Industry/Research) (14 - 20 weeks)",
        "credits": 10,
        "course_type": "INT"
      }
    ]
  },
  "2022_AI": {
    "1": [
      {
        "code": "BMATS101",
        "name": "Mathematics-I for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPHYS102",
        "name": "Applied Physics for CSE stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPOPS103",
        "name": "Principles of Programming Using C",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK105X",
        "name": "Emerging Technology Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK105X",
        "name": "Programming Languages Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BENGK106",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK158",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK158",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK104A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105H",
        "name": "Introduction to Internet of Things (IOT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BCHES102",
        "name": "Applied Chemistry for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK103",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BPWSK106",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK107",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "2": [
      {
        "code": "BMATS201",
        "name": "Mathematics-II forCSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCHES202",
        "name": "Applied Chemistry for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK203",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK205X",
        "name": "Programming Language Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK205X",
        "name": "Emerging Technology Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPWSK206",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK207",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK258",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "KIDTK258",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205H",
        "name": "Introduction to Internet of Things(IoT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPHYS202",
        "name": "Applied Physics for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPOPS203",
        "name": "Principles of Programming Using C",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BENGK206",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK258",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "3": [
      {
        "code": "BCS301",
        "name": "Mathematics for Computer Science",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCS302",
        "name": "Digital Design & Computer Organization",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS303",
        "name": "Operating Systems",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS304",
        "name": "Data Structures and Applications",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCSL305",
        "name": "Data Structures Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BXX306X",
        "name": ": CS",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BSCK307",
        "name": "Social Connect and Responsibility",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BXX358X",
        "name": "Ability Enhancement Course/Skill Enhancement Course \u2013 III",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK359",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "4": [
      {
        "code": "BCS401",
        "name": "Analysis & Design of Algorithms",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BAD402",
        "name": "Artificial Intelligence",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS403",
        "name": "Database Management Systems",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCSL404",
        "name": "Analysis & Design of Algorithms Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BXX405X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BDS456X",
        "name": "Ability Enhancement Course/Skill Enhancement Course- IV",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BUHK408",
        "name": "Universal human values course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BNSK459",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "BCS501",
        "name": "Software Engineering & Project Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCS502",
        "name": "Computer Networks",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS503",
        "name": "Theory of Computation",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BAIL504",
        "name": "Data Visualization Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BXX515X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BAI586",
        "name": ": AI",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BRMK557",
        "name": "Research Methodology and IPR",
        "credits": 3,
        "course_type": "AEC"
      },
      {
        "code": "BCS508",
        "name": "Environmental Studies and E-waste Management",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BNSK559",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "6": [
      {
        "code": "BAI601",
        "name": "Natural Language Processing",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BAI602",
        "name": "Machine Learning -I",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BXX613X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BXX654X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BAI685",
        "name": ": AI",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BAIL606",
        "name": "Machine Learning lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BXX657X",
        "name": "Ability Enhancement Course/Skill Development Course V",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK658",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "BIKS609",
        "name": "Indian Knowledge System",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "7": [
      {
        "code": "BAI701",
        "name": "Deep Learning & Reinforcement Learning",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BAI702",
        "name": "Machine Learning -II",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BAD703",
        "name": "Data Security & Privacy",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BAI714X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BAI755X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BAI786",
        "name": "Major Project Phase-II",
        "credits": 6,
        "course_type": "PROJ"
      }
    ],
    "8": [
      {
        "code": "BAI801X",
        "name": "Professional Elective (Online Courses) Only through NPTEL",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BAI802X",
        "name": "Open Elective (Online Courses) Only through NPTEL",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BAI803",
        "name": "Internship (Industry/Research) (14 - 20 weeks)",
        "credits": 10,
        "course_type": "INT"
      }
    ]
  },
  "2022_DS": {
    "1": [
      {
        "code": "BMATS101",
        "name": "Mathematics-I for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPHYS102",
        "name": "Applied Physics for CSE stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPOPS103",
        "name": "Principles of Programming Using C",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK105X",
        "name": "Emerging Technology Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK105X",
        "name": "Programming Languages Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BENGK106",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK158",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK158",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK104A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105H",
        "name": "Introduction to Internet of Things (IOT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BCHES102",
        "name": "Applied Chemistry for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK103",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BPWSK106",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK107",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "2": [
      {
        "code": "BMATS201",
        "name": "Mathematics-II forCSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCHES202",
        "name": "Applied Chemistry for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK203",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK205X",
        "name": "Programming Language Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK205X",
        "name": "Emerging Technology Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPWSK206",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK207",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK258",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "KIDTK258",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205H",
        "name": "Introduction to Internet of Things(IoT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPHYS202",
        "name": "Applied Physics for CSE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPOPS203",
        "name": "Principles of Programming Using C",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BENGK206",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK258",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "3": [
      {
        "code": "BCS301",
        "name": "Mathematics for Computer Science",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCS302",
        "name": "Digital Design & Computer Organization",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS303",
        "name": "Operating Systems",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS304",
        "name": "Data Structures and Applications",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCSL305",
        "name": "Data Structures Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BXX306X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BSCK307",
        "name": "Social Connect and Responsibility",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BXX358X",
        "name": "Ability Enhancement Course/Skill Enhancement Course - III",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK359",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "4": [
      {
        "code": "BCS401",
        "name": "Analysis & Design of Algorithms",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCS402",
        "name": "Microcontrollers",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS403",
        "name": "Database Management Systems",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCSL404",
        "name": "Analysis & Design of Algorithms Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BXX405X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BDS456X",
        "name": "Ability Enhancement Course/Skill Enhancement Course- IV",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BBOC407",
        "name": "Biology For Computer Engineers",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "BUHK408",
        "name": "Universal human values course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BNSK459",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "BCS501",
        "name": "Software Engineering & Project Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCS502",
        "name": "Computer Networks",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS503",
        "name": "Theory of Computation",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BAIL504",
        "name": "Data Visualization Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BXX515X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BCD586",
        "name": "Mini Project",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BRMK557",
        "name": "Research Methodology and IPR",
        "credits": 3,
        "course_type": "AEC"
      },
      {
        "code": "BCS508",
        "name": "Environmental Studies and E-waste Management",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BNSK559",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "6": [
      {
        "code": "BAD601",
        "name": "Big Data Analytics",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BDS602",
        "name": "Artificial Intelligence & Machine Learning",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BXX613X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BXX654X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BCD685",
        "name": "Project Phase I",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BCSL606",
        "name": "Machine Learning lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BXX657X",
        "name": "Ability Enhancement Course/Skill Development Course V",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK658",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "BIKS609",
        "name": "Indian Knowledge System",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "7": [
      {
        "code": "BDS701",
        "name": "Parallel Programming",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BAD702",
        "name": "Statistical Machine Learning for Data Science",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCS703",
        "name": "Cryptography & Network Security",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCD714X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BCD755X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BCD786",
        "name": "Major Project Phase-II",
        "credits": 6,
        "course_type": "PROJ"
      }
    ],
    "8": [
      {
        "code": "BCD801X",
        "name": "Professional Elective (Online Courses) Only through NPTEL",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BCD802X",
        "name": "Open Elective (Online Courses) Only through NPTEL",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BCD803",
        "name": "Internship (Industry/Research) (14 - 20 weeks)",
        "credits": 10,
        "course_type": "INT"
      }
    ]
  },
  "2022_CV": {
    "1": [
      {
        "code": "BMATC101",
        "name": "Mathematics-I for Civil Engg stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPHYC102",
        "name": "Applied Physics for Civil Engineering Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCIVC103",
        "name": "Civil Engineering Dept",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK105X",
        "name": "Emerging Technology Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK105X",
        "name": "Programming Language Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BENGK106",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK158",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK158",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK104A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105H",
        "name": "Introduction to Internet of Things (IOT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BCHEC102",
        "name": "Applied Chemistry for Civil Engg Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK103",
        "name": "Computer-aided engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BPWSK106",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK107",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BITDK158",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "PCC"
      }
    ],
    "2": [
      {
        "code": "BMATC201",
        "name": "Mathematics-II for Civil Engg Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCHEC202",
        "name": "Applied Chemistry for Civil Engineering stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK203",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK205X",
        "name": "Programming Language Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK205X",
        "name": "Emerging Technology Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPWSK206",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK207",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK258",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK258",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK204A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205H",
        "name": "Introduction to Internet of Things(IoT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPHYC202",
        "name": "Applied Physics for Civil Engineering",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCIVC203",
        "name": "Civil Engineering Dept",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BENGK206",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "3": [
      {
        "code": "BCV301",
        "name": "Strength of Materials",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCV302",
        "name": "Engineering Survey",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCV303",
        "name": "TD- Geology/CV PSB-Geology/CV",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCV304",
        "name": "Water Supply and Waste water Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCV305",
        "name": "Computer Aided Building Planning and Drawing",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BCV306X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BSCK307",
        "name": "Social Connect and Responsibility",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BCV358X",
        "name": "Ability Enhancement Course/Skill Enhancement Course - III",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK359",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "4": [
      {
        "code": "BCV401",
        "name": "Analysis of Structures",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCV402",
        "name": "Fluid Mechanics and Hydraulics",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCV403",
        "name": "Transportation Engineering",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCVL404",
        "name": "Building Materials Testing Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BCV405X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BCV456X",
        "name": "Ability Enhancement Course/Skill Enhancement Course- IV",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BBOK407",
        "name": "Biology For Engineers",
        "credits": 3,
        "course_type": "BSC"
      },
      {
        "code": "BUHK408",
        "name": "Universal human values course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BNSK459",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "BCV501",
        "name": "Construction Management and Entrepreneurship",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BCV502",
        "name": "Geotechnical Engineering",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCV503",
        "name": "Concrete Technology",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCV504",
        "name": "Environmental Engineering Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BCV515X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BCV586",
        "name": "Mini Project/Extensive Survey Project",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BRMK557",
        "name": "Research Methodology and IPR",
        "credits": 3,
        "course_type": "AEC"
      },
      {
        "code": "BESK508",
        "name": "Environmental Studies",
        "credits": 2,
        "course_type": "MC"
      },
      {
        "code": "BNSK559",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "6": [
      {
        "code": "BCV601",
        "name": "Design of RCC Structures",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCV602",
        "name": "Irrigation Engineering and Hydraulic Structures",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCV613X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BCV654X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BCV685",
        "name": "Major Project Phase I",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BCVL606",
        "name": "Software ApplicationLab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BCV657X",
        "name": "Ability Enhancement Course/Skill Development Course V",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK658",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "BIKS609",
        "name": "Indian Knowledge System",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "7": [
      {
        "code": "BCV701",
        "name": "Design of Steel Structures",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCV702",
        "name": "Estimation and Contract Management",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BCV703",
        "name": "Prestressed Concrete",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCV714X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BCV755X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BCV786",
        "name": "Major Project Phase-II",
        "credits": 6,
        "course_type": "PROJ"
      }
    ],
    "8": [
      {
        "code": "BCV801X",
        "name": "Professional Elective (Online Courses)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BCV802X",
        "name": "Open Elective (Online Courses)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BCV803",
        "name": "Internship (Industry/Research) (14 - 20 Weeks)",
        "credits": 10,
        "course_type": "INT"
      }
    ]
  },
  "2022_EC": {
    "1": [
      {
        "code": "BMATE101",
        "name": "Mathematics-I for EEE Streams",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPHYE102",
        "name": "Applied Physics for EEE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEEE103",
        "name": "# Elementsof Electrical Engineering",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BBEE103",
        "name": "## Basic Electronicsfor EEE stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK105X",
        "name": "Emerging Technology Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK105X",
        "name": "Programming Language Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BENGK106",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK107",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK158",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK158",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK104A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105H",
        "name": "Introduction to Internet of Things (IOT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BCHEE102",
        "name": "Chemistry for EES",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK103",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BPWSK106",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "2": [
      {
        "code": "BMATE201",
        "name": "Mathematics-II for EESI",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCHEE202",
        "name": "Chemistry for EES",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK203",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK205X",
        "name": "Programming Language Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK205X",
        "name": "Emerging Technology Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPWKS206",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK207",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK258",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK258",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK201A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK202B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK203C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK205E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205H",
        "name": "Introduction to Internet of Things(IoT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPHYE202",
        "name": "Applied Physics for EES",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEEE203",
        "name": "# Elements of Electrical Engineering",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BBEE203",
        "name": "## Basic Electronics",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BENGK206",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK204A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "3": [
      {
        "code": "BMATEC301",
        "name": "AV Mathematics-III for EC Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BEC302",
        "name": "Digital System Design using Verilog",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEC303",
        "name": "Electronic Principles and Circuits",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEC304",
        "name": "Network Analysis",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BECL305",
        "name": "Analog and Digital Systems Design Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BXX306X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BSCK307",
        "name": "Social Connect and Responsibility",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BXX358X",
        "name": "Ability Enhancement Course/Skill Enhancement Course\u2013 III",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK359",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "4": [
      {
        "code": "BEC401",
        "name": "Electromagnetics Theory",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BEC402",
        "name": "Principles of Communication Systems",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEC403",
        "name": "Control Systems",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BECL404",
        "name": "Communication Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BEC405X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BXX456X",
        "name": "Ability Enhancement Course/Skill Enhancement Course- IV",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BBOK407",
        "name": "Biology For Engineers",
        "credits": 3,
        "course_type": "BSC"
      },
      {
        "code": "BUHK408",
        "name": "Universal human values course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BNSK459",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "BEC501",
        "name": "Technological Innovation and Management Entrepreneurship",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BEC502",
        "name": "Digital Signal Processing",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEC503",
        "name": "TD- ECE/ETE PSB-ECE/ETE",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BECL504",
        "name": "Digital Communication Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BEC515X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BEC586",
        "name": "TD- ECE/ETE PSB-ECE/ETE",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BRMK557",
        "name": "Research Methodology and IPR",
        "credits": 3,
        "course_type": "AEC"
      },
      {
        "code": "BESK508",
        "name": "Environmental Studies",
        "credits": 2,
        "course_type": "MC"
      },
      {
        "code": "BNSK559",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "6": [
      {
        "code": "BEC601",
        "name": "TD- ECE/ETE PSB-ECE/ETE",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEC602",
        "name": "VLSI Design and Testing",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEC613X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BEC654X",
        "name": "TD- ECE/ETE PSB-ECE/ETE",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BEC685",
        "name": "TD- ECE/ETE PSB-ECE/ETE",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BECL606",
        "name": "VLSI Design and Testing Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BEC657X",
        "name": "Ability Enhancement Course/Skill Development Course V",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK658",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "BIKS609",
        "name": "Indian Knowledge System",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BXX601",
        "name": "Embedded System Design",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BXX602",
        "name": "Microwave and Antenna Theory",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BXX613X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BXX654X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BXXL606",
        "name": "Lab component",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BXX657X",
        "name": "Ability Enhancement Course/Skill Development Course V",
        "credits": 1,
        "course_type": "PEC"
      }
    ],
    "7": [
      {
        "code": "BEC701",
        "name": "Microwave Engineering and Antenna Theory",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEC702",
        "name": "Computer Networks and Protocols",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEC703",
        "name": "Wireless Communication Systems",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEC714X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BEC755X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BEC786",
        "name": "Major Project Phase-II",
        "credits": 6,
        "course_type": "PROJ"
      },
      {
        "code": "BXX701",
        "name": "To be completed in 5th / 6th semester",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BXX702",
        "name": "To be completed in 5th / 6th semester",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BXX703",
        "name": "To be completed in 5th / 6th semester",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BXX714X",
        "name": "Professional Elective Course (MOOC Courses )",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BXX755X",
        "name": "Open Elective Courses(MOOC courses)",
        "credits": 3,
        "course_type": "OEC"
      }
    ],
    "8": [
      {
        "code": "BEC801X",
        "name": "Professional Elective (Online Courses)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BEC802X",
        "name": "Open Elective (Online Courses)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BEC803",
        "name": "Internship (Industry/Research) (14 - 20 weeks)",
        "credits": 10,
        "course_type": "INT"
      },
      {
        "code": "BXX801X",
        "name": "Professional Elective (Online Courses)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BXX802X",
        "name": "Open Elective (Online Courses)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BXX883",
        "name": "Project Work Outcome of Training",
        "credits": 9,
        "course_type": "PROJ"
      },
      {
        "code": "BXX804",
        "name": "Internship (Industry/Research) (Two semesters)",
        "credits": 10,
        "course_type": "INT"
      }
    ]
  },
  "2022_EE": {
    "1": [
      {
        "code": "BMATE101",
        "name": "Mathematics-I for EEE Streams",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPHYE102",
        "name": "Applied Physics for EEE Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEEE103",
        "name": "# Elementsof Electrical Engineering",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BBEE103",
        "name": "## Basic Electronicsfor EEE stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK105X",
        "name": "Emerging Technology Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK105X",
        "name": "Programming Language Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BENGK106",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK107",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK158",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK158",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK104A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105H",
        "name": "Introduction to Internet of Things (IOT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BCHEE102",
        "name": "Chemistry for EES",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK103",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BPWSK106",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "2": [
      {
        "code": "BMATE201",
        "name": "Mathematics-II for EESI",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCHEE202",
        "name": "Chemistry for EES",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK203",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK205X",
        "name": "Programming Language Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK205X",
        "name": "Emerging Technology Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPWKS206",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK207",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK258",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK258",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK201A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK202B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK203C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK205E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205H",
        "name": "Introduction to Internet of Things(IoT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205J",
        "name": "Introduction to Embedded System",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPHYE202",
        "name": "Applied Physics for EES",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEEE203",
        "name": "# Elements of Electrical Engineering",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BBEE203",
        "name": "## Basic Electronics",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BENGK206",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK204A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "3": [
      {
        "code": "BEE301",
        "name": "Engineering Mathematics for EEE",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BEE302",
        "name": "Electric Circuit Analysis",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEE303",
        "name": "Analog Electronic Circuits",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEE304",
        "name": "Transformers and Generators",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BEEL305",
        "name": "Transformers and Generators lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BEE306X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BSCK307",
        "name": "Social Connect and Responsibility",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BEE358X",
        "name": "Ability Enhancement Course/Skill Enhancement Course - III",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK359",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "4": [
      {
        "code": "BEE401",
        "name": "Electric Motors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BEE402",
        "name": "Transmission and Distribution",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEE403",
        "name": "Microcontrollers",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEEL404",
        "name": "Electric Motors lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BEE405X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BEE456X",
        "name": "Ability Enhancement Course/Skill Enhancement Course- IV",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BBOK407",
        "name": "Biology For Engineers",
        "credits": 3,
        "course_type": "BSC"
      },
      {
        "code": "BUHK408",
        "name": "Universal human values course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BNSK459",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "BEE501",
        "name": "Engineering Management and Entrepreneurship",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BEE502",
        "name": "Signals & DSP",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEE503",
        "name": "Power Electronics",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEEL504",
        "name": "Power Electronics Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BEE515X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BEE586",
        "name": "Mini Project",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BRMK557",
        "name": "Research Methodology and IPR",
        "credits": 3,
        "course_type": "AEC"
      },
      {
        "code": "BESK508",
        "name": "Environmental Studies",
        "credits": 2,
        "course_type": "MC"
      },
      {
        "code": "BNSK559",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "6": [
      {
        "code": "BEE601",
        "name": "Power system Analysis - I",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEE602",
        "name": "Control Systems",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEE613X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BEE654X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BEE685",
        "name": "Project Phase I",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BEEL606",
        "name": "Control System Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BEE657X",
        "name": "Ability Enhancement Course/Skill Development Course - V",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK658",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "7": [
      {
        "code": "BEE701",
        "name": "Switchgear and Protection",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEE702",
        "name": "Industrial Drives and Applications",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEE703",
        "name": "Power system analysis- II",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BEE714X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BEE755X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BEE786",
        "name": "Major Project Phase-II",
        "credits": 6,
        "course_type": "PROJ"
      }
    ],
    "8": [
      {
        "code": "BEE801X",
        "name": "Professional Elective (Online Courses)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BEE802X",
        "name": "Open Elective (Online Courses)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BEE803",
        "name": "Internship (Industry/Research) (14 - 20 weeks)",
        "credits": 10,
        "course_type": "INT"
      }
    ]
  },
  "2022_ME": {
    "1": [
      {
        "code": "BMATM101",
        "name": "Mathematics I for Mechanical Engg Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPHYM102",
        "name": "Applied Physics for ME Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEMEM103",
        "name": "Elements of Mechanical Engineering",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK105X",
        "name": "Emerging Technology Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK105X",
        "name": "Programming language Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BENGK106",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK158",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK158",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK104A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105H",
        "name": "Introduction to Internet of Things (IOT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105J",
        "name": "(PLC-I) Programming Language Courses-I",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105C",
        "name": "Basics to JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BCHEM102",
        "name": "Applied Chemistry for ME Streams",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK103",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BPWSK106",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK107",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK104E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "2": [
      {
        "code": "BMATM201",
        "name": "Mathematics-II for Mechanical Engg Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCHEM202",
        "name": "Applied Chemistry for ME Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK203",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK205X",
        "name": "Programming Language Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPWSK206",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK207",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK258",
        "name": "Scientific Foundations for Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK258",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK204A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205H",
        "name": "Introduction to Internet of Things(IoT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205J",
        "name": "(PLC-II) Programming Language Courses-II",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPHYM202",
        "name": "Applied Physics for ME Streams",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEME203",
        "name": "Elements of Mechanical Engineering",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BPLCK205X",
        "name": "Programming Language Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BENGK206",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "3": [
      {
        "code": "BME301",
        "name": "Mechanics of Materials",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BME302",
        "name": "Manufacturing Process",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BME303",
        "name": "Material Science and Engineering",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BME304",
        "name": "Basic Thermodynamics",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BME306X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BSCK307",
        "name": "Social Connect and Responsibility",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BME358X",
        "name": "Ability Enhancement Course/Skill Enhancement Course - III",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK359",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "4": [
      {
        "code": "BME401",
        "name": "Applied Thermodynamics",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BME402",
        "name": "Machining Science & Metrology",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BME403",
        "name": "Fluid Mechanics",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BME404",
        "name": "Mechanical Measurements and Metrology lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BME405X",
        "name": "Respective Dept. PSB: Respective Dept.",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BME456X",
        "name": "Ability Enhancement Course/Skill Enhancement Course- IV",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BBOK407",
        "name": "Biology For Engineers",
        "credits": 3,
        "course_type": "BSC"
      },
      {
        "code": "BUHK408",
        "name": "Universal human values course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BNSK459",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "BME501",
        "name": "Industrial Management & Entrepreneurship",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BME502",
        "name": "Turbo machines",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BME503",
        "name": "Theory of Machines",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BME504L",
        "name": "CNC Programming and 3-D Printing lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BME515X",
        "name": "Professional Elective - I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BME586",
        "name": "Mini Project",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BRMK557",
        "name": "Research Methodology and IPR",
        "credits": 3,
        "course_type": "AEC"
      },
      {
        "code": "BESK508",
        "name": "Environmental Studies",
        "credits": 2,
        "course_type": "MC"
      },
      {
        "code": "BNSK559",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "6": [
      {
        "code": "BME601",
        "name": "Heat Transfer",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BME602",
        "name": "Machine Design",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BME613X",
        "name": "Professional Elective - II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BME654X",
        "name": "Open Elective -I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BME685",
        "name": "Major Project Phase - I",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BMEL606L",
        "name": "Design lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BME657X",
        "name": "Ability Enhancement Course/Skill Development Course V",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK658",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "BIKS609",
        "name": "Indian Knowledge System",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "7": [
      {
        "code": "BME701",
        "name": "Finite Element Methods",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BME702",
        "name": "Hydraulics and Pneumatics",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BME703",
        "name": "Control Engineering",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BME714X",
        "name": "Professional Elective-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BME755X",
        "name": "Open Elective- II",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BME786",
        "name": "Major Project Phase-II",
        "credits": 6,
        "course_type": "PROJ"
      }
    ]
  },
  "2022_RI": {
    "1": [
      {
        "code": "BMATM101",
        "name": "Mathematics I for Mechanical Engg Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BPHYM102",
        "name": "Applied Physics for ME Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEMEM103",
        "name": "Elements of Mechanical Engineering",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK105X",
        "name": "Emerging Technology Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPLCK105X",
        "name": "Programming language Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BENGK106",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK158",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK158",
        "name": "Scientific Foundations of Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK104A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK104D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105H",
        "name": "Introduction to Internet of Things (IOT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK105J",
        "name": "(PLC-I) Programming Language Courses-I",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105C",
        "name": "Basics to JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK105D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BCHEM102",
        "name": "Applied Chemistry for ME Streams",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK103",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BPWSK106",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK107",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK104E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "2": [
      {
        "code": "BMATM201",
        "name": "Mathematics-II for Mechanical Engg Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCHEM202",
        "name": "Applied Chemistry for ME Stream",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BCEDK203",
        "name": "Computer-Aided Engineering Drawing",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BESCK204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BETCK205X",
        "name": "Programming Language Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BPWSK206",
        "name": "Professional Writing Skills in English",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BICOK207",
        "name": "Indian Constitution",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BSFHK258",
        "name": "Scientific Foundations for Health",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BIDTK258",
        "name": "Innovation and Design Thinking",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BESCK204A",
        "name": "Introduction to Civil Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204B",
        "name": "Introduction to Electrical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204C",
        "name": "Introduction to Electronics Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204D",
        "name": "Introduction to Sustainable Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BESCK204E",
        "name": "Introduction to C Programming",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205F",
        "name": "Waste Management",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205G",
        "name": "Emerging Applications of Biosensors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205H",
        "name": "Introduction to Internet of Things(IoT)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205I",
        "name": "Introduction to Cyber Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BETCK205J",
        "name": "(PLC-II) Programming Language Courses-II",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205A",
        "name": "Introduction to Web Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205B",
        "name": "Introduction to Python Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205C",
        "name": "Basics of JAVA programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPLCK205D",
        "name": "Introduction to C++ Programming",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "BPHYM202",
        "name": "Applied Physics for ME Streams",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BEME203",
        "name": "Elements of Mechanical Engineering",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BPLCK205X",
        "name": "Programming Language Course-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BENGK206",
        "name": "Communicative English",
        "credits": 1,
        "course_type": "AEC"
      }
    ],
    "3": [
      {
        "code": "BRI301",
        "name": "Fundamentals of Robotics & Applications",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BRI302",
        "name": "Manufacturing Technology for Robots",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BRI303",
        "name": "Analog and Digital Electronic Circuits",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BRI304",
        "name": "Data Structures and Algorithms",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BRI306X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BSCK307",
        "name": "Social Connect and Responsibility",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BRI358X",
        "name": "Ability Enhancement Course/Skill Enhancement Course \u2013 III",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK359",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "BRI358A",
        "name": "Fundamentals of Virtual Reality and App Development (1:0:0:0)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BRI358B",
        "name": "Introduction to C++ Programming (1:0:0:0)",
        "credits": 1,
        "course_type": "PCC"
      }
    ],
    "4": [
      {
        "code": "BRI401",
        "name": "Robot Kinematics, Dynamics and Control",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BRI402",
        "name": "Mechanics and Measurement Systems for Robots",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BRI403",
        "name": "Microcontroller",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BRIL404",
        "name": "Robot Programming & Simulation Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BRI405X",
        "name": "ESC/ETC/PLC",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "BRI456X",
        "name": "Ability Enhancement Course/Skill Enhancement Course- IV",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BBOK407",
        "name": "Biology For Engineers",
        "credits": 3,
        "course_type": "BSC"
      },
      {
        "code": "BUHK408",
        "name": "Universal human values course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BNSK459",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "BRI456A",
        "name": "Supervisory Control and Data Acquisition System (SCADA) (1:0:0:0)",
        "credits": 1,
        "course_type": "PCC"
      }
    ],
    "5": [
      {
        "code": "BRI501",
        "name": "Managerial Economics for Robotics",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "BRI502",
        "name": "Hydraulics & Pneumatics",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BRI503",
        "name": "Fundamentals of AI for Robots",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BRIL504",
        "name": "Artificial Intelligence Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BRI515X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BRI586",
        "name": "Concerned Department",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BRMK557",
        "name": "Research Methodology and IPR",
        "credits": 3,
        "course_type": "AEC"
      },
      {
        "code": "BESK508",
        "name": "Environmental Studies",
        "credits": 2,
        "course_type": "MC"
      },
      {
        "code": "BNSK559",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "6": [
      {
        "code": "BRI601",
        "name": "Robot Operating System",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BRI602",
        "name": "Digital Image Processing",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BRI613X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BRI654X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BRI685",
        "name": "Project Phase I",
        "credits": 2,
        "course_type": "PROJ"
      },
      {
        "code": "BRIL606",
        "name": "Virtual Instrumentation & Automation Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "BRI657X",
        "name": "Ability Enhancement Course/Skill Development Course V",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "BNSK658",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "BIKS609",
        "name": "Indian Knowledge System",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "BRI613A",
        "name": "Industry 4.0 and IIOT",
        "credits": 4,
        "course_type": "PCC"
      }
    ],
    "7": [
      {
        "code": "BRI701",
        "name": "Control Engineering",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "BRI702",
        "name": "Natural Language Processing",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BRI703",
        "name": "Cloud Computing",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "BRI714X",
        "name": "Professional Elective Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BRI755X",
        "name": "Open Elective Course",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BRI786",
        "name": "Major Project Phase-II",
        "credits": 6,
        "course_type": "PROJ"
      }
    ],
    "8": [
      {
        "code": "BRI811X",
        "name": "Professional Elective (Online Courses)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "BRI852X",
        "name": "Open Elective (Online Courses)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "BRI883",
        "name": "Internship (Industry/Research) (14 - 20 weeks)",
        "credits": 10,
        "course_type": "INT"
      }
    ]
  },
  "2025_CS": {
    "1": [
      {
        "code": "1BMATX101",
        "name": "Applied Mathematics -I (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYX102",
        "name": "Applied Physics (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX103",
        "name": "Computer-Aided Engineering Drawing (Stream Specific Course)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX105X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS106",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL107X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BIDTL158",
        "name": "Innovation and Design Thinking Lab (Project-based learning)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC101",
        "name": "Physics for Sustainable Structural Systems (CV stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM101",
        "name": "Differential Calculus and Linear Algebra: ME Stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE101",
        "name": "Differential Calculus and Linear Algebra: EEE stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS101",
        "name": "Physics of Electrical Engineering Materials (EEE stream-only for EEE students)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYS102",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDC103",
        "name": "Computer-Aided Engineering Drawing for CV Stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDM103",
        "name": "Computer-Aided Engineering Drawing for ME stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDEC103",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDE103",
        "name": "Computer-Aided Engineering Drawing for EEE stream (only for EEE students)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDS103",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV105",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE105",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE105",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME105",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT105",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT105",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA105",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE105",
        "name": "Elements of Aeronautica Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE105",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX105",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX102",
        "name": "Applied Chemistry (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA103",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC104X",
        "name": "Engineering Science Course- I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC105X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG106",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO107",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104A",
        "name": "Introduction to C Programming (For none IT programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104B",
        "name": "Python Programming (for CSE and allied programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104C",
        "name": "Introduction to Electronics and Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "2": [
      {
        "code": "1BMATX201",
        "name": "Applied Mathematics -II (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX202",
        "name": "Applied Chemistry (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA203",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC205X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG206",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO207",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BPRJ258",
        "name": "Interdisciplinary Project-Based Learning",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC201",
        "name": "Applied Chemistry for Sustainable Structure & Material Design (CV)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM201",
        "name": "Applied Chemistry for Advanced Metal Protection and Sustainable Energy Systems (ME)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE201",
        "name": "Applied Chemistry for Emerging Electronics and Futuristic Devices (EEE, ECE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS201",
        "name": "Applied Chemistry for Smart Systems (CSE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204A",
        "name": "Introduction to C Programming (for non-IT programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204B",
        "name": "Python Programming (For CSE and allied programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204C",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYX202",
        "name": "Applied Physics (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX203",
        "name": "Computer-Aided Engineering Drawing (Stream Specific)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX205X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS206",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL207X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYS202",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV205",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME205",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE205",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE205",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT205",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT205",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA205",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE205",
        "name": "Elements of Aeronautical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE205",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX205",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDS203",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 2,
        "course_type": "PCC"
      }
    ],
    "3": [
      {
        "code": "1BMATCS301",
        "name": "Probability, Distributions and Statistics",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCS302",
        "name": "Object Oriented Programming with Java",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCS303",
        "name": "Digital Design and Computer Organization",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCS304",
        "name": "Operating Systems",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCS305",
        "name": "Data Structures and Applications",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCSL306",
        "name": "Data Structures Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BCSL307A",
        "name": "Project Management (with Git)",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCP308",
        "name": "Community Project (Project-Based Learning) / Societal Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BNSS309",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP310",
        "name": "TD -Maths Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCS501",
        "name": "Software Engineering and Project Management",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BCS502",
        "name": "TD/PSB: CS Allied",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCS503",
        "name": "Theory of Computation",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCS504",
        "name": "TD/PSB: CS Allied",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR (Online)",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BCSL507",
        "name": "Web Technology Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BCS508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCS601",
        "name": "Advanced Java Programming",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCS602",
        "name": "Cryptography and Network Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCS603",
        "name": "High Performance Computing",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCS604",
        "name": "Internet of Things",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BCSL606",
        "name": "TD/PSB: CS Allied",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCS608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX609",
        "name": "Universal Human Value (VTU ONLINE Course)",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BCS701",
        "name": "Big Data Analytics",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BCS705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PCC"
      },
      {
        "code": "1BIKS706",
        "name": "Indian Knowledge System (VTU online Course)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Internship (15 weeks or 90 working days)",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BMAT301",
        "name": "Program Specific Mathematics /Programme Specific Core Course",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX302",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX303",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX304",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX305",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL306",
        "name": "Professional Core Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL307X",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX701",
        "name": "To be completed in the Summer Semester after 6th semester",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II***",
        "credits": 7,
        "course_type": "PEC"
      }
    ],
    "4": [
      {
        "code": "1BCS401",
        "name": "Discrete Mathematics and Graph Theory",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCS402",
        "name": "Database Management Systems",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCS403",
        "name": "Computer Networks",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCS404",
        "name": "Design and Analysis of Algorithms",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCSL405",
        "name": "Algorithms Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL406X",
        "name": "Ability Enhancement Course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCS407",
        "name": "Biology for Computer Engineers",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BEP408",
        "name": "Environmental Science Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BNSK409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP410",
        "name": "TD -Maths Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 14,
        "course_type": "PCC"
      },
      {
        "code": "1BXX401",
        "name": "Programme Specific Mathematics / Programme Core Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX402",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX403",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX404",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL405",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL406",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX407",
        "name": "Programme Specific Biology",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXX409",
        "name": "PCC/PEC",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BNSS409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "1BXX501",
        "name": "This course must be pertaining to economics and management of the concerned degree program. The course syllabus should have both economics and management topics and the course title should bear the word Management.",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BXX502",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX503",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX504",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXXL507",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXX508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BXX601",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX602",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX603",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX604",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL606",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX609",
        "name": "TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BXX701",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BIKS706",
        "name": "TD/PSB TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Hours per day changes, based on the nature of the Internship,",
        "credits": 9,
        "course_type": "PEC"
      }
    ]
  },
  "2025_AI": {
    "1": [
      {
        "code": "1BMATX101",
        "name": "Applied Mathematics -I (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYX102",
        "name": "Applied Physics (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX103",
        "name": "Computer-Aided Engineering Drawing (Stream Specific Course)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX105X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS106",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL107X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BIDTL158",
        "name": "Innovation and Design Thinking Lab (Project-based learning)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC101",
        "name": "Physics for Sustainable Structural Systems (CV stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM101",
        "name": "Differential Calculus and Linear Algebra: ME Stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE101",
        "name": "Differential Calculus and Linear Algebra: EEE stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS101",
        "name": "Physics of Electrical Engineering Materials (EEE stream-only for EEE students)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYS102",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDC103",
        "name": "Computer-Aided Engineering Drawing for CV Stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDM103",
        "name": "Computer-Aided Engineering Drawing for ME stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDEC103",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDE103",
        "name": "Computer-Aided Engineering Drawing for EEE stream (only for EEE students)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDS103",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV105",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE105",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE105",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME105",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT105",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT105",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA105",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE105",
        "name": "Elements of Aeronautica Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE105",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX105",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX102",
        "name": "Applied Chemistry (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA103",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC104X",
        "name": "Engineering Science Course- I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC105X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG106",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO107",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104A",
        "name": "Introduction to C Programming (For none IT programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104B",
        "name": "Python Programming (for CSE and allied programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104C",
        "name": "Introduction to Electronics and Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "2": [
      {
        "code": "1BMATX201",
        "name": "Applied Mathematics -II (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX202",
        "name": "Applied Chemistry (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA203",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC205X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG206",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO207",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BPRJ258",
        "name": "Interdisciplinary Project-Based Learning",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC201",
        "name": "Applied Chemistry for Sustainable Structure & Material Design (CV)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM201",
        "name": "Applied Chemistry for Advanced Metal Protection and Sustainable Energy Systems (ME)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE201",
        "name": "Applied Chemistry for Emerging Electronics and Futuristic Devices (EEE, ECE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS201",
        "name": "Applied Chemistry for Smart Systems (CSE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204A",
        "name": "Introduction to C Programming (for non-IT programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204B",
        "name": "Python Programming (For CSE and allied programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204C",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYX202",
        "name": "Applied Physics (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX203",
        "name": "Computer-Aided Engineering Drawing (Stream Specific)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX205X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS206",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL207X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYS202",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV205",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME205",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE205",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE205",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT205",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT205",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA205",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE205",
        "name": "Elements of Aeronautical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE205",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX205",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDS203",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 2,
        "course_type": "PCC"
      }
    ],
    "3": [
      {
        "code": "1BMATCS301",
        "name": "Probability, Distributions and Statistics",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCS302",
        "name": "Object Oriented Programming with Java",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCS303",
        "name": "Digital Design and Computer Organization",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCS304",
        "name": "Operating Systems",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCS305",
        "name": "Data Structures and Applications",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCSL306",
        "name": "Data Structures Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL307X",
        "name": "Ability Enhancement Course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCP308",
        "name": "Community Project (Project-Based Learning) / Societal Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BNSS309",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP310",
        "name": "TD -Maths Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCS501",
        "name": "Software Engineering and Project Management",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BAI502",
        "name": "Artificial Intelligence",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCS503",
        "name": "Theory of Computation",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BAI504",
        "name": "Computer Networks",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR (Online)",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BAIL507",
        "name": "Data Visualization Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BAI508",
        "name": "CIE: By Departments SEE: Evaluation by",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCS601",
        "name": "Advanced Java Programming",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BIS602",
        "name": "Information and Network Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BAI603",
        "name": "TD/PSB: CS Allied",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BAI604",
        "name": "Natural Language Processing",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BAIL606",
        "name": "Deep Learning Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BAI608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX609",
        "name": "Universal Human Value (VTU ONLINE Course)",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BAD701",
        "name": "High Performance Computing in Artificial Intelligence",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BAI705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PCC"
      },
      {
        "code": "1BIKS706",
        "name": "Indian Knowledge System (VTU online Course)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Internship (15 weeks or 90 working days)",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BMAT301",
        "name": "Program Specific Mathematics /Programme Specific Core Course",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX302",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX303",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX304",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX305",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL306",
        "name": "Professional Core Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXX701",
        "name": "To be completed in the Summer Semester after 6th semester",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II***",
        "credits": 7,
        "course_type": "PEC"
      }
    ],
    "4": [
      {
        "code": "1BAI401",
        "name": "Discrete Mathematics and Optimization Techniques",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BAI402",
        "name": "Design and Analysis of Algorithms",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BAI403",
        "name": "Database Management Systems",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BAI404",
        "name": "TD/PSB: CS Allied",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BAIL405",
        "name": "Machine Learning Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL406X",
        "name": "Ability Enhancement Course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCS407",
        "name": "Biology for Computer Engineers",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BEP408",
        "name": "Environmental Science Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BNSK409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP410",
        "name": "TD -Maths Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 14,
        "course_type": "PCC"
      },
      {
        "code": "1BXX401",
        "name": "Programme Specific Mathematics / Programme Core Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX402",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX403",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX404",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL405",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL406",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX407",
        "name": "Programme Specific Biology",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXX409",
        "name": "PCC/PEC",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BNSS409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "1BXX501",
        "name": "This course must be pertaining to economics and management of the concerned degree program. The course syllabus should have both economics and management topics and the course title should bear the word Management.",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BXX502",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX503",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX504",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXXL507",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXX508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BXX601",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX602",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX603",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX604",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL606",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX609",
        "name": "TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BXX701",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BIKS706",
        "name": "TD/PSB TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Hours per day changes, based on the nature of the Internship,",
        "credits": 9,
        "course_type": "PEC"
      }
    ]
  },
  "2025_DS": {
    "1": [
      {
        "code": "1BMATX101",
        "name": "Applied Mathematics -I (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYX102",
        "name": "Applied Physics (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX103",
        "name": "Computer-Aided Engineering Drawing (Stream Specific Course)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX105X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS106",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL107X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BIDTL158",
        "name": "Innovation and Design Thinking Lab (Project-based learning)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC101",
        "name": "Physics for Sustainable Structural Systems (CV stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM101",
        "name": "Differential Calculus and Linear Algebra: ME Stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE101",
        "name": "Differential Calculus and Linear Algebra: EEE stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS101",
        "name": "Physics of Electrical Engineering Materials (EEE stream-only for EEE students)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYS102",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDC103",
        "name": "Computer-Aided Engineering Drawing for CV Stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDM103",
        "name": "Computer-Aided Engineering Drawing for ME stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDEC103",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDE103",
        "name": "Computer-Aided Engineering Drawing for EEE stream (only for EEE students)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDS103",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV105",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE105",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE105",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME105",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT105",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT105",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA105",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE105",
        "name": "Elements of Aeronautica Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE105",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX105",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX102",
        "name": "Applied Chemistry (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA103",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC104X",
        "name": "Engineering Science Course- I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC105X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG106",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO107",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104A",
        "name": "Introduction to C Programming (For none IT programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104B",
        "name": "Python Programming (for CSE and allied programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104C",
        "name": "Introduction to Electronics and Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "2": [
      {
        "code": "1BMATX201",
        "name": "Applied Mathematics -II (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX202",
        "name": "Applied Chemistry (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA203",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC205X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG206",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO207",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BPRJ258",
        "name": "Interdisciplinary Project-Based Learning",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC201",
        "name": "Applied Chemistry for Sustainable Structure & Material Design (CV)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM201",
        "name": "Applied Chemistry for Advanced Metal Protection and Sustainable Energy Systems (ME)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE201",
        "name": "Applied Chemistry for Emerging Electronics and Futuristic Devices (EEE, ECE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS201",
        "name": "Applied Chemistry for Smart Systems (CSE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204A",
        "name": "Introduction to C Programming (for non-IT programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204B",
        "name": "Python Programming (For CSE and allied programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204C",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYX202",
        "name": "Applied Physics (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX203",
        "name": "Computer-Aided Engineering Drawing (Stream Specific)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX205X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS206",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL207X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYS202",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV205",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME205",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE205",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE205",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT205",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT205",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA205",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE205",
        "name": "Elements of Aeronautical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE205",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX205",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDS203",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 2,
        "course_type": "PCC"
      }
    ],
    "3": [
      {
        "code": "1BMATCS301",
        "name": "Probability, Distributions and Statistics",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCS302",
        "name": "Object Oriented Programming with Java",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCS303",
        "name": "Digital Design and Computer Organization",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCS304",
        "name": "Operating Systems",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCS305",
        "name": "Data Structures and Applications",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCSL306",
        "name": "Data Structures Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BCSL307A",
        "name": "Project Management (with Git)",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCP308",
        "name": "Community Project (Project-Based Learning) / Societal Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BNSS309",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP310",
        "name": "TD -Maths Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCS501",
        "name": "Software Engineering and Project Management",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BCS502",
        "name": "TD/PSB: CS Allied",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCS503",
        "name": "Theory of Computation",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCG504",
        "name": "Digital Image Processing",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR (Online)",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BCGL507",
        "name": "Digital Image Processing Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BCG508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCS601",
        "name": "Advanced Java Programming",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCS602",
        "name": "Cryptography and Network Security",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCG603",
        "name": "Software Design Patterns",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCS604",
        "name": "Internet of Things",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BCSL606",
        "name": "TD/PSB: CS Allied",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCG608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX609",
        "name": "Universal Human Value (VTU ONLINE Course)",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BCG701",
        "name": "Animation Principles and Design",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BCG705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PCC"
      },
      {
        "code": "1BIKS706",
        "name": "Indian Knowledge System (VTU online Course)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Internship (15 weeks or 90 working days)",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BMAT301",
        "name": "Program Specific Mathematics /Programme Specific Core Course",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX302",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX303",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX304",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX305",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL306",
        "name": "Professional Core Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL307X",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX701",
        "name": "To be completed in the Summer Semester after 6th semester",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II***",
        "credits": 7,
        "course_type": "PEC"
      }
    ],
    "4": [
      {
        "code": "1BCS401",
        "name": "Discrete Mathematics and Graph Theory",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCS402",
        "name": "Database Management Systems",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCS403",
        "name": "Computer Networks",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCS404",
        "name": "Design and Analysis of Algorithms",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCSL405",
        "name": "Algorithms Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL406X",
        "name": "Ability Enhancement Course",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCS407",
        "name": "Biology for Computer Engineers",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BEP408",
        "name": "Environmental Science Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BNSK409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP410",
        "name": "TD -Maths Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 14,
        "course_type": "PCC"
      },
      {
        "code": "1BXX401",
        "name": "Programme Specific Mathematics / Programme Core Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX402",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX403",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX404",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL405",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL406",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX407",
        "name": "Programme Specific Biology",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXX409",
        "name": "PCC/PEC",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BNSS409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "1BXX501",
        "name": "This course must be pertaining to economics and management of the concerned degree program. The course syllabus should have both economics and management topics and the course title should bear the word Management.",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BXX502",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX503",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX504",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXXL507",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXX508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BXX601",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX602",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX603",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX604",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL606",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX609",
        "name": "TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BXX701",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BIKS706",
        "name": "TD/PSB TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Hours per day changes, based on the nature of the Internship,",
        "credits": 9,
        "course_type": "PEC"
      }
    ]
  },
  "2025_EC": {
    "1": [
      {
        "code": "1BMATX101",
        "name": "Applied Mathematics -I (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYX102",
        "name": "Applied Physics (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX103",
        "name": "Computer-Aided Engineering Drawing (Stream Specific Course)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX105X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS106",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL107X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BIDTL158",
        "name": "Innovation and Design Thinking Lab (Project-based learning)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC101",
        "name": "Physics for Sustainable Structural Systems (CV stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM101",
        "name": "Differential Calculus and Linear Algebra: ME Stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE101",
        "name": "Differential Calculus and Linear Algebra: EEE stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS101",
        "name": "Physics of Electrical Engineering Materials (EEE stream-only for EEE students)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYS102",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDC103",
        "name": "Computer-Aided Engineering Drawing for CV Stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDM103",
        "name": "Computer-Aided Engineering Drawing for ME stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDEC103",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDE103",
        "name": "Computer-Aided Engineering Drawing for EEE stream (only for EEE students)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDS103",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV105",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE105",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE105",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME105",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT105",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT105",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA105",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE105",
        "name": "Elements of Aeronautica Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE105",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX105",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX102",
        "name": "Applied Chemistry (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA103",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC104X",
        "name": "Engineering Science Course- I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC105X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG106",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO107",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104A",
        "name": "Introduction to C Programming (For none IT programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104B",
        "name": "Python Programming (for CSE and allied programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104C",
        "name": "Introduction to Electronics and Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "2": [
      {
        "code": "1BMATX201",
        "name": "Applied Mathematics -II (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX202",
        "name": "Applied Chemistry (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA203",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC205X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG206",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO207",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BPRJ258",
        "name": "Interdisciplinary Project-Based Learning",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC201",
        "name": "Applied Chemistry for Sustainable Structure & Material Design (CV)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM201",
        "name": "Applied Chemistry for Advanced Metal Protection and Sustainable Energy Systems (ME)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE201",
        "name": "Applied Chemistry for Emerging Electronics and Futuristic Devices (EEE, ECE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS201",
        "name": "Applied Chemistry for Smart Systems (CSE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204A",
        "name": "Introduction to C Programming (for non-IT programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204B",
        "name": "Python Programming (For CSE and allied programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204C",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYX202",
        "name": "Applied Physics (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX203",
        "name": "Computer-Aided Engineering Drawing (Stream Specific)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX205X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS206",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL207X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYS202",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV205",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME205",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE205",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE205",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT205",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT205",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA205",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE205",
        "name": "Elements of Aeronautical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE205",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX205",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDS203",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 2,
        "course_type": "PCC"
      }
    ],
    "3": [
      {
        "code": "1BMATEC301",
        "name": "Transform Techniques and Optimization Theory",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BEC302",
        "name": "Digital System Design Using Verilog",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BEC303",
        "name": "Respective Engg Dept",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BEC304",
        "name": "Analog Electronics and Linear Integrated Circuits",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEC305",
        "name": "Respective Engg Dept",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BECL306",
        "name": "Analog Electronics and Linear Integrated Circuits Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BECL307X",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCP308",
        "name": "Community Project (Project-Based Learning) / Societal Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BNSS309",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP310",
        "name": "Additional Mathematics-1",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEC501",
        "name": "This course must be pertaining to economics and management of the concerned degree program. The course syllabus should have both economics and management topics and the course title should bear the word Management.",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BEC502",
        "name": "Digital Signal Processing",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BEC503",
        "name": "Engineering Electromagnetics",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEC504",
        "name": "Introduction to VLSI Design",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEC505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BECL507",
        "name": "Respective Engg Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BEC508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEC601",
        "name": "Computer Networking and Communication",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BEC602",
        "name": "Antenna and Wireless Communication",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEC603",
        "name": "Digital Communication Systems",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEC604",
        "name": "FPGA Based System Design",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEC605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BECL606",
        "name": "Respective Engg Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BECL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BEC608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEC609",
        "name": "Universal Human Value",
        "credits": 14,
        "course_type": "PCC"
      },
      {
        "code": "1BEC701",
        "name": "Edge computing with Tiny ML",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BEC702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BEC703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BEC704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BEC705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PCC"
      },
      {
        "code": "1BIKS706",
        "name": "Indian Knowledge System",
        "credits": 14,
        "course_type": "PCC"
      },
      {
        "code": "1BEC801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BEC802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BEC803X",
        "name": "Internship (15 weeks or 90 working days)",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BMAT301",
        "name": "Program Specific Mathematics /Programme Specific Core Course",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX302",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX303",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX304",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX305",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL306",
        "name": "Professional Core Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL307X",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX701",
        "name": "To be completed in the Summer Semester after 6th semester",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course-IV (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course (NPTEL/VTU Online course)-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II***",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Irrespective of the duration of the Internship the total credits for Internship remains same",
        "credits": 9,
        "course_type": "PEC"
      }
    ],
    "4": [
      {
        "code": "1BMATEC401",
        "name": "Mathematics for Machine Learning",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEC402",
        "name": "Applied Computer Organization and Microcontroller",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BEC403",
        "name": "Respective Engg Dept",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BEC404",
        "name": "Respective Engg Dept",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BECL405",
        "name": "Signals and Analog Communications Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BECL406",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BEC407",
        "name": "Biology for Electrical and Electronics Engineers",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BEP408",
        "name": "Environmental Science Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BEC409",
        "name": "Introduction to Analog Communication",
        "credits": 9,
        "course_type": "PCC"
      },
      {
        "code": "1BNSK409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP410",
        "name": "Additional Mathematics-2",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BXX401",
        "name": "Programme Specific Mathematics / Programme Core Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX402",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX403",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX404",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL405",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL406",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX407",
        "name": "Programme Specific Biology",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXX409",
        "name": "PCC/PEC",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BNSS409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "1BXX501",
        "name": "This course must be pertaining to economics and management of the concerned degree program. The course syllabus should have both economics and management topics and the course title should bear the word Management.",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BXX502",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX503",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX504",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXXL507",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXX508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BXX601",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX602",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX603",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX604",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL606",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX609",
        "name": "TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BXX701",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BIKS706",
        "name": "TD/PSB TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Hours per day changes, based on the nature of the Internship,",
        "credits": 9,
        "course_type": "PEC"
      }
    ]
  },
  "2025_EE": {
    "1": [
      {
        "code": "1BMATX101",
        "name": "Applied Mathematics -I (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYX102",
        "name": "Applied Physics (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX103",
        "name": "Computer-Aided Engineering Drawing (Stream Specific Course)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX105X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS106",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL107X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BIDTL158",
        "name": "Innovation and Design Thinking Lab (Project-based learning)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC101",
        "name": "Physics for Sustainable Structural Systems (CV stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM101",
        "name": "Differential Calculus and Linear Algebra: ME Stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE101",
        "name": "Differential Calculus and Linear Algebra: EEE stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS101",
        "name": "Physics of Electrical Engineering Materials (EEE stream-only for EEE students)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYS102",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDC103",
        "name": "Computer-Aided Engineering Drawing for CV Stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDM103",
        "name": "Computer-Aided Engineering Drawing for ME stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDEC103",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDE103",
        "name": "Computer-Aided Engineering Drawing for EEE stream (only for EEE students)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDS103",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV105",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE105",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE105",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME105",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT105",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT105",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA105",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE105",
        "name": "Elements of Aeronautica Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE105",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX105",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX102",
        "name": "Applied Chemistry (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA103",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC104X",
        "name": "Engineering Science Course- I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC105X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG106",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO107",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104A",
        "name": "Introduction to C Programming (For none IT programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104B",
        "name": "Python Programming (for CSE and allied programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104C",
        "name": "Introduction to Electronics and Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "2": [
      {
        "code": "1BMATX201",
        "name": "Applied Mathematics -II (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX202",
        "name": "Applied Chemistry (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA203",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC205X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG206",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO207",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BPRJ258",
        "name": "Interdisciplinary Project-Based Learning",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC201",
        "name": "Applied Chemistry for Sustainable Structure & Material Design (CV)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM201",
        "name": "Applied Chemistry for Advanced Metal Protection and Sustainable Energy Systems (ME)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE201",
        "name": "Applied Chemistry for Emerging Electronics and Futuristic Devices (EEE, ECE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS201",
        "name": "Applied Chemistry for Smart Systems (CSE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204A",
        "name": "Introduction to C Programming (for non-IT programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204B",
        "name": "Python Programming (For CSE and allied programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204C",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYX202",
        "name": "Applied Physics (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX203",
        "name": "Computer-Aided Engineering Drawing (Stream Specific)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX205X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS206",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL207X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYS202",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV205",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME205",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE205",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE205",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT205",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT205",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA205",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE205",
        "name": "Elements of Aeronautical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE205",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX205",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDS203",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 2,
        "course_type": "PCC"
      }
    ],
    "3": [
      {
        "code": "1BMATEE301",
        "name": "Complex Analysis, Transform Technique and Optimization",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BEE302",
        "name": "Analog Electronic Circuits",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BEE303",
        "name": "Electric Circuit Analysis",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BEE304",
        "name": "Digital Electronic Circuits",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEE305",
        "name": "Transformers and Generators",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEEL306",
        "name": "Transformers and Generators lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BEEL307X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCP308",
        "name": "Community Project (Project-Based Learning) / Societal Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BNSS309",
        "name": "The teaching learning methodology shall be aligned \u2013 with the specific nature of each subject, viz., NSS, PE, Yoga, and Music.",
        "credits": 9,
        "course_type": "PCC"
      },
      {
        "code": "1BMATDIP310",
        "name": "Additional Mathematics -I course for Lateral Entry Students",
        "credits": 10,
        "course_type": "PCC"
      },
      {
        "code": "1BMAT301",
        "name": "Program Specific Mathematics /Programme Specific Core Course",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX302",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX303",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX304",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX305",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL306",
        "name": "Professional Core Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL307X",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX701",
        "name": "To be completed in the Summer Semester after 6th semester",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course-IV (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course (NPTEL/VTU Online course)-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II***",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BIKS706",
        "name": "TD/PSB TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Irrespective of the duration of the Internship the total credits for Internship remains same",
        "credits": 9,
        "course_type": "PEC"
      }
    ],
    "4": [
      {
        "code": "1BEE401",
        "name": "Electric Motors",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEE402",
        "name": "Microcontroller",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BEE403",
        "name": "Field Theory",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BEE404",
        "name": "Transmission and Distribution",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BEEL405",
        "name": "Electric Motors Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BEEL406",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BEE407",
        "name": "Biology for Electrical Engineers",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BEP408",
        "name": "Environmental Science Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BEE409",
        "name": "Electric Power Generation and Economics",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BNSS409",
        "name": "The teaching learning methodology shall be \u2013 aligned with the specific nature of each subject, viz., NSS, PE, Yoga, and Music.",
        "credits": 10,
        "course_type": "PCC"
      },
      {
        "code": "1BMATDIP410",
        "name": "Additional Mathematics -II course for Lateral Entry Students",
        "credits": 11,
        "course_type": "PCC"
      },
      {
        "code": "1BXX401",
        "name": "Programme Specific Mathematics / Programme Core Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX402",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX403",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX404",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL405",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL406",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX407",
        "name": "Programme Specific Biology",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXX409",
        "name": "PCC/PEC",
        "credits": 3,
        "course_type": "PEC"
      }
    ],
    "5": [
      {
        "code": "1BXX501",
        "name": "This course must be pertaining to economics and management of the concerned degree program. The course syllabus should have both economics and management topics and the course title should bear the word Management.",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BXX502",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX503",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX504",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXXL507",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXX508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BXX601",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX602",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX603",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX604",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL606",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX609",
        "name": "TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BXX701",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BIKS706",
        "name": "TD/PSB TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Hours per day changes, based on the nature of the Internship,",
        "credits": 9,
        "course_type": "PEC"
      }
    ]
  },
  "2025_CV": {
    "1": [
      {
        "code": "1BMATX101",
        "name": "Applied Mathematics -I (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYX102",
        "name": "Applied Physics (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX103",
        "name": "Computer-Aided Engineering Drawing (Stream Specific Course)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX105X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS106",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL107X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BIDTL158",
        "name": "Innovation and Design Thinking Lab (Project-based learning)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC101",
        "name": "Physics for Sustainable Structural Systems (CV stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM101",
        "name": "Differential Calculus and Linear Algebra: ME Stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE101",
        "name": "Differential Calculus and Linear Algebra: EEE stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS101",
        "name": "Physics of Electrical Engineering Materials (EEE stream-only for EEE students)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYS102",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDC103",
        "name": "Computer-Aided Engineering Drawing for CV Stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDM103",
        "name": "Computer-Aided Engineering Drawing for ME stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDEC103",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDE103",
        "name": "Computer-Aided Engineering Drawing for EEE stream (only for EEE students)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDS103",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV105",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE105",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE105",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME105",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT105",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT105",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA105",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE105",
        "name": "Elements of Aeronautica Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE105",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX105",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX102",
        "name": "Applied Chemistry (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA103",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC104X",
        "name": "Engineering Science Course- I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC105X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG106",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO107",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104A",
        "name": "Introduction to C Programming (For none IT programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104B",
        "name": "Python Programming (for CSE and allied programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104C",
        "name": "Introduction to Electronics and Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "2": [
      {
        "code": "1BMATX201",
        "name": "Applied Mathematics -II (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX202",
        "name": "Applied Chemistry (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA203",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC205X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG206",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO207",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BPRJ258",
        "name": "Interdisciplinary Project-Based Learning",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC201",
        "name": "Applied Chemistry for Sustainable Structure & Material Design (CV)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM201",
        "name": "Applied Chemistry for Advanced Metal Protection and Sustainable Energy Systems (ME)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE201",
        "name": "Applied Chemistry for Emerging Electronics and Futuristic Devices (EEE, ECE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS201",
        "name": "Applied Chemistry for Smart Systems (CSE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204A",
        "name": "Introduction to C Programming (for non-IT programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204B",
        "name": "Python Programming (For CSE and allied programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204C",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYX202",
        "name": "Applied Physics (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX203",
        "name": "Computer-Aided Engineering Drawing (Stream Specific)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX205X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS206",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL207X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYS202",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV205",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME205",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE205",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE205",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT205",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT205",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA205",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE205",
        "name": "Elements of Aeronautical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE205",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX205",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDS203",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 2,
        "course_type": "PCC"
      }
    ],
    "3": [
      {
        "code": "1BCV302",
        "name": "Fluid Mechanics and Hydraulic Machinery",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCV303",
        "name": "Solid Mechanics",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCV304",
        "name": "Building Materials and Construction Methods",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCV305",
        "name": "Engineering Geology for Infrastructure Projects",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCVL306",
        "name": "Building CAD and 3D Modelling Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BCVL307X",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCP308",
        "name": "Community Project (Project-Based Learning) / Societal Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BNSS309",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP310",
        "name": "Mathematics course for Lateral Entry Students",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCV501",
        "name": "Construction Economics, Project Management and Entrepreneurship",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BCV502",
        "name": "Geotechnical Engineering -I",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCV503",
        "name": "Design of Reinforced Concrete Structure",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCV504",
        "name": "Highway and Traffic Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXXL507",
        "name": "Concrete and Highway Materials Testing Laboratory",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXX508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCV601",
        "name": "Water Resource and Irrigation Engineering",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCV602",
        "name": "Quantity Surveying and Construction Contracts",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCV603",
        "name": "Geotechnical Engineering -II",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCV604",
        "name": "Railway, Airport and Harbour Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCV605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BCVL606",
        "name": "Computer Aided Design and Detailing of RC Structures Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BCVL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCV608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BUHV609",
        "name": "Universal Human Value",
        "credits": 14,
        "course_type": "PCC"
      },
      {
        "code": "1BCV701",
        "name": "Design & Detailing of Steel Structures",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCV702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BCV703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BCV704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BCV705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PCC"
      },
      {
        "code": "1BIKS706",
        "name": "Indian Knowledge System",
        "credits": 14,
        "course_type": "PCC"
      },
      {
        "code": "1BCV801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BCV802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BCV803X",
        "name": "Internship (15 weeks or 90 working days)",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BMAT301",
        "name": "Program Specific Mathematics /Programme Specific Core Course",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX302",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX303",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX304",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX305",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL306",
        "name": "Professional Core Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL307X",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX701",
        "name": "To be completed in the Summer Semester after 6th semester",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course-IV (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course (NPTEL/VTU Online course)-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II***",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Irrespective of the duration of the Internship the total credits for Internship remains same",
        "credits": 9,
        "course_type": "PEC"
      }
    ],
    "4": [
      {
        "code": "1BCV401",
        "name": "Surveying and Geospatial Techniques",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCV402",
        "name": "Water Supply and Sanitary Engineering",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BCV403",
        "name": "Analysis of Structures",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BCV404",
        "name": "Building Information Modelling (BIM)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCVL405",
        "name": "Surveying and Geospatial Engineering Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BCVL406",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCV407",
        "name": "Biology for Civil Engineers",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BEP408",
        "name": "Environmental Science Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BCV409",
        "name": "Concrete Technology",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BNSK409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP410",
        "name": "Mathematics course for Lateral Entry Students",
        "credits": 14,
        "course_type": "PCC"
      },
      {
        "code": "1BXX401",
        "name": "Programme Specific Mathematics / Programme Core Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX402",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX403",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX404",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL405",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL406",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX407",
        "name": "Programme Specific Biology",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXX409",
        "name": "PCC/PEC",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BNSS409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "1BXX501",
        "name": "This course must be pertaining to economics and management of the concerned degree program. The course syllabus should have both economics and management topics and the course title should bear the word Management.",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BXX502",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX503",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX504",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXXL507",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXX508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BXX601",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX602",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX603",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX604",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL606",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX609",
        "name": "TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BXX701",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BIKS706",
        "name": "TD/PSB TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Hours per day changes, based on the nature of the Internship,",
        "credits": 9,
        "course_type": "PEC"
      }
    ]
  },
  "2025_ME": {
    "1": [
      {
        "code": "1BMATX101",
        "name": "Applied Mathematics -I (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYX102",
        "name": "Applied Physics (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX103",
        "name": "Computer-Aided Engineering Drawing (Stream Specific Course)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX105X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS106",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL107X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BIDTL158",
        "name": "Innovation and Design Thinking Lab (Project-based learning)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC101",
        "name": "Physics for Sustainable Structural Systems (CV stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM101",
        "name": "Differential Calculus and Linear Algebra: ME Stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE101",
        "name": "Differential Calculus and Linear Algebra: EEE stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS101",
        "name": "Physics of Electrical Engineering Materials (EEE stream-only for EEE students)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYS102",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDC103",
        "name": "Computer-Aided Engineering Drawing for CV Stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDM103",
        "name": "Computer-Aided Engineering Drawing for ME stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDEC103",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDE103",
        "name": "Computer-Aided Engineering Drawing for EEE stream (only for EEE students)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDS103",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV105",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE105",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE105",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME105",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT105",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT105",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA105",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE105",
        "name": "Elements of Aeronautica Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE105",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX105",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX102",
        "name": "Applied Chemistry (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA103",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC104X",
        "name": "Engineering Science Course- I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC105X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG106",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO107",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104A",
        "name": "Introduction to C Programming (For none IT programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104B",
        "name": "Python Programming (for CSE and allied programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104C",
        "name": "Introduction to Electronics and Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "2": [
      {
        "code": "1BMATX201",
        "name": "Applied Mathematics -II (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX202",
        "name": "Applied Chemistry (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA203",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC205X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG206",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO207",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BPRJ258",
        "name": "Interdisciplinary Project-Based Learning",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC201",
        "name": "Applied Chemistry for Sustainable Structure & Material Design (CV)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM201",
        "name": "Applied Chemistry for Advanced Metal Protection and Sustainable Energy Systems (ME)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE201",
        "name": "Applied Chemistry for Emerging Electronics and Futuristic Devices (EEE, ECE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS201",
        "name": "Applied Chemistry for Smart Systems (CSE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204A",
        "name": "Introduction to C Programming (for non-IT programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204B",
        "name": "Python Programming (For CSE and allied programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204C",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYX202",
        "name": "Applied Physics (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX203",
        "name": "Computer-Aided Engineering Drawing (Stream Specific)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX205X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS206",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL207X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYS202",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV205",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME205",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE205",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE205",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT205",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT205",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA205",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE205",
        "name": "Elements of Aeronautical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE205",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX205",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDS203",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 2,
        "course_type": "PCC"
      }
    ],
    "3": [
      {
        "code": "1BMATM301",
        "name": "Transforms and Statistics",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BME302",
        "name": "Materials Science and Metallurgy",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BME303",
        "name": "Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BME304",
        "name": "Mechanics of Materials",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BME305",
        "name": "Manufacturing Technology - I",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BMEL306",
        "name": "Computer Aided Machine Drawing Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMEL307X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCP308",
        "name": "Community Project (Project-Based Learning) / Societal Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BNSS309",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP310",
        "name": "Mathematics Course for Lateral Entry Students",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BMAT301",
        "name": "Program Specific Mathematics /Programme Specific Core Course",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX302",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX303",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX304",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX305",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL306",
        "name": "Professional Core Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL307X",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX701",
        "name": "To be completed in the Summer Semester after 6th semester",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course-IV (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course (NPTEL/VTU Online course)-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II***",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BIKS706",
        "name": "TD/PSB TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Irrespective of the duration of the Internship the total credits for Internship remains same",
        "credits": 9,
        "course_type": "PEC"
      }
    ],
    "4": [
      {
        "code": "1BMATM401",
        "name": "Complex Analysis and Probability Distributions",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BME402",
        "name": "Manufacturing Technology II",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BME403",
        "name": "Applied Thermodynamics",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BME404",
        "name": "Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BMEL405",
        "name": "Mechanical Measurements and Metrology Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMEL406X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BME407",
        "name": "Mechanical Engineering",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BEP408",
        "name": "Environmental Science Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BME409",
        "name": "Kinematics of Machines",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BNSK409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP410",
        "name": "Mathematics Course for Lateral Entry Students",
        "credits": 14,
        "course_type": "PCC"
      },
      {
        "code": "1BXX401",
        "name": "Programme Specific Mathematics / Programme Core Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX402",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX403",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX404",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL405",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL406",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX407",
        "name": "Programme Specific Biology",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXX409",
        "name": "PCC/PEC",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BNSS409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      }
    ],
    "5": [
      {
        "code": "1BXX501",
        "name": "This course must be pertaining to economics and management of the concerned degree program. The course syllabus should have both economics and management topics and the course title should bear the word Management.",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BXX502",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX503",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX504",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXXL507",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXX508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BXX601",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX602",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX603",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX604",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL606",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX609",
        "name": "TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BXX701",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BIKS706",
        "name": "TD/PSB TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Hours per day changes, based on the nature of the Internship,",
        "credits": 9,
        "course_type": "PEC"
      }
    ]
  },
  "2025_RI": {
    "1": [
      {
        "code": "1BMATX101",
        "name": "Applied Mathematics -I (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYX102",
        "name": "Applied Physics (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX103",
        "name": "Computer-Aided Engineering Drawing (Stream Specific Course)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX104X",
        "name": "Engineering Science Course-I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX105X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS106",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL107X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BIDTL158",
        "name": "Innovation and Design Thinking Lab (Project-based learning)",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC101",
        "name": "Physics for Sustainable Structural Systems (CV stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM101",
        "name": "Differential Calculus and Linear Algebra: ME Stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE101",
        "name": "Differential Calculus and Linear Algebra: EEE stream",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS101",
        "name": "Physics of Electrical Engineering Materials (EEE stream-only for EEE students)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYS102",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDC103",
        "name": "Computer-Aided Engineering Drawing for CV Stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDM103",
        "name": "Computer-Aided Engineering Drawing for ME stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDEC103",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDE103",
        "name": "Computer-Aided Engineering Drawing for EEE stream (only for EEE students)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCEDS103",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV105",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE105",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE105",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME105",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT105",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT105",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA105",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE105",
        "name": "Elements of Aeronautica Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE105",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX105",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX102",
        "name": "Applied Chemistry (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA103",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC104X",
        "name": "Engineering Science Course- I",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC105X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG106",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO107",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104A",
        "name": "Introduction to C Programming (For none IT programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104B",
        "name": "Python Programming (for CSE and allied programmes)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104C",
        "name": "Introduction to Electronics and Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC104E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      }
    ],
    "2": [
      {
        "code": "1BMATX201",
        "name": "Applied Mathematics -II (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCHEX202",
        "name": "Applied Chemistry (Stream Specific Course)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BAIA203",
        "name": "Introduction to AI and Applications",
        "credits": 3,
        "course_type": "ETC"
      },
      {
        "code": "1BESC204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BPLC205X",
        "name": "Programming Language Course",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BENG206",
        "name": "Communication Skills",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BICO207",
        "name": "Indian Constitution & Engineering Ethics",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BPRJ258",
        "name": "Interdisciplinary Project-Based Learning",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BMATC201",
        "name": "Applied Chemistry for Sustainable Structure & Material Design (CV)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATM201",
        "name": "Applied Chemistry for Advanced Metal Protection and Sustainable Energy Systems (ME)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATE201",
        "name": "Applied Chemistry for Emerging Electronics and Futuristic Devices (EEE, ECE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BMATS201",
        "name": "Applied Chemistry for Smart Systems (CSE)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204A",
        "name": "Introduction to C Programming (for non-IT programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204B",
        "name": "Python Programming (For CSE and allied programmes)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204C",
        "name": "Introduction to Electronics & Communication Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204D",
        "name": "Introduction to Mechanical Engineering",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BESC204E",
        "name": "Essentials of Information Technology",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BPHYX202",
        "name": "Applied Physics (Stream Specific)",
        "credits": 4,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDX203",
        "name": "Computer-Aided Engineering Drawing (Stream Specific)",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX204X",
        "name": "Engineering Science Course-II",
        "credits": 3,
        "course_type": "ESC"
      },
      {
        "code": "1BXXX205X",
        "name": "Programme Specific Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BSKS206",
        "name": "Humanities Dept",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXXXL207X",
        "name": "Programme-Specific Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BPHYS202",
        "name": "Quantum Physics and Applications (CSE stream)",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BCIV205",
        "name": "Mechanics and Materials Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEME205",
        "name": "Elements of Mechanical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BBEE205",
        "name": "Basics of Electrical Engineering",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECE205",
        "name": "Fundamentals of Electronics & Communication Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEIT205",
        "name": "C Programming Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEBT205",
        "name": "Elements of Biotechnology and Biomimetics",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BSSA205",
        "name": "Principles of Soil Science and Agronomy",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BEAE205",
        "name": "Elements of Aeronautical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BECHE205",
        "name": "Elements of Chemical Engineering Lab",
        "credits": 2,
        "course_type": "PCC"
      },
      {
        "code": "1BETX205",
        "name": "Technology of Textile Lab",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BCEDS203",
        "name": "Computer-Aided Engineering Drawing for CSE stream",
        "credits": 2,
        "course_type": "PCC"
      }
    ],
    "3": [
      {
        "code": "1BRI301",
        "name": "Discrete Mathematics and Probability Theory",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BRI302",
        "name": "Data Structures and Algorithms",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BRI303",
        "name": "Mechanics of Materials",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BRI304",
        "name": "Analog and Digital Electronic Circuits (ADEC)",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BRI305",
        "name": "Fundamentals of Industrial Robots",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BRIL306",
        "name": "Computer Aided Modelling Lab",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BRIL307",
        "name": "Analog and Digital Electronic Circuits Lab",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BCP308",
        "name": "Community Project (Project-Based Learning) / Societal Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BNSS309",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP310",
        "name": "Mathematics course for Lateral Entry Students",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BMAT301",
        "name": "Program Specific Mathematics /Programme Specific Core Course",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX302",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX303",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX304",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX305",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL306",
        "name": "Professional Core Course Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL307X",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX701",
        "name": "To be completed in the Summer Semester after 6th semester",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course-IV (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course (NPTEL/VTU Online course)-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II***",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BIKS706",
        "name": "TD/PSB TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Irrespective of the duration of the Internship the total credits for Internship remains same",
        "credits": 9,
        "course_type": "PEC"
      }
    ],
    "4": [
      {
        "code": "1BRI401",
        "name": "Robot Kinematics and Dynamics",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BRI402",
        "name": "Object-oriented programming",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BRI403",
        "name": "TD/PSB: ECE/ME/EEE/RAI",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BRI404",
        "name": "TD/PSB: ECE/EEE/ME/RAI",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BRIL405",
        "name": "Sensors and Actuators Laboratory",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BRIL406",
        "name": "Industrial Robot Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BRI407",
        "name": "Programme Specific Biology",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BEP408",
        "name": "Environmental Science Project",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BRI409",
        "name": "Design of Robotic components",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BNSS409",
        "name": "National Service Scheme (NSS)",
        "credits": 0,
        "course_type": "MC"
      },
      {
        "code": "1BMATDIP410",
        "name": "Mathematics course for Lateral Entry Students",
        "credits": 14,
        "course_type": "PCC"
      },
      {
        "code": "1BXX401",
        "name": "Programme Specific Mathematics / Programme Core Course",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX402",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX403",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "PCC"
      },
      {
        "code": "1BXX404",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXXL405",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL406",
        "name": "Ability Enhancement Course Laboratory**",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX407",
        "name": "Programme Specific Biology",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXX409",
        "name": "PCC/PEC",
        "credits": 3,
        "course_type": "PEC"
      }
    ],
    "5": [
      {
        "code": "1BXX501",
        "name": "This course must be pertaining to economics and management of the concerned degree program. The course syllabus should have both economics and management topics and the course title should bear the word Management.",
        "credits": 3,
        "course_type": "HSMC"
      },
      {
        "code": "1BXX502",
        "name": "TD/PSB",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX503",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX504",
        "name": "TD/PSB",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX505X",
        "name": "Professional Elective Course-I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BRM506",
        "name": "Research Methodology and IPR",
        "credits": 2,
        "course_type": "BSC"
      },
      {
        "code": "1BXXL507",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXX508",
        "name": "CIE: By Departments SEE: Evaluation by industry experts",
        "credits": 2,
        "course_type": "PEC"
      },
      {
        "code": "1BXX601",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX602",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX603",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX604",
        "name": "TD/PSB-",
        "credits": 3,
        "course_type": "PCC"
      },
      {
        "code": "1BXX605X",
        "name": "Professional Elective Courses-II",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL606",
        "name": "PCC Lab",
        "credits": 1,
        "course_type": "PEC"
      },
      {
        "code": "1BXXL607X",
        "name": "Ability Enhancement Course Laboratory",
        "credits": 1,
        "course_type": "AEC"
      },
      {
        "code": "1BXX608",
        "name": "Capstone Project - Phase I",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX609",
        "name": "TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 9,
        "course_type": "PEC"
      },
      {
        "code": "1BXX701",
        "name": "TD/PSB-",
        "credits": 4,
        "course_type": "IPCC"
      },
      {
        "code": "1BXX702X",
        "name": "Professional Elective Course-III",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX703X",
        "name": "Professional Elective Course -IV",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX704X",
        "name": "Open Elective Course-I",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX705",
        "name": "Capstone Project - Phase-II",
        "credits": 7,
        "course_type": "PEC"
      },
      {
        "code": "1BIKS706",
        "name": "TD/PSB TD Respective Dept/ VTU Online (COE). CIE by VTU online COE",
        "credits": 1,
        "course_type": "PCC"
      },
      {
        "code": "1BXX801X",
        "name": "Professional Elective-V (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "PEC"
      },
      {
        "code": "1BXX802X",
        "name": "Open Elective-II (NPTEL/VTU Online Course)",
        "credits": 3,
        "course_type": "OEC"
      },
      {
        "code": "1BXX803X",
        "name": "Hours per day changes, based on the nature of the Internship,",
        "credits": 9,
        "course_type": "PEC"
      }
    ]
  }
};

export function getOfficialCredit(subjectCode, scheme = '2022') {
    if (!subjectCode) return null;
    const cleanCode = String(subjectCode).toUpperCase().trim();
    
    // Check non-credit audit courses first (NSS, PE, Yoga, etc.)
    if (cleanCode.startsWith('BPEK') || cleanCode.startsWith('BNSK') || cleanCode.startsWith('BYOK')) {
        return 0;
    }
    
    if (OFFICIAL_CREDITS_LOOKUP[`${scheme}_${cleanCode}`] !== undefined) {
        return OFFICIAL_CREDITS_LOOKUP[`${scheme}_${cleanCode}`];
    }
    if (OFFICIAL_CREDITS_LOOKUP[cleanCode] !== undefined) {
        return OFFICIAL_CREDITS_LOOKUP[cleanCode];
    }
    return null;
}
