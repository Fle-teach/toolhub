// Global variables
let wishesData = [];
let studentData = [];
let currentClasses = {};
let selectedStudent = null;
let optimizationRunning = false;
let bestClasses = null;
let bestScore = 0;
let iterations = 0;
let improvements = 0;
let optimizerStagnation = 0;
let initialSolutionFailureReason = '';
let manualExclusionHighlightStudentIds = new Set();
let manualExclusionHighlightPairs = new Set();

// Drag and drop variables
let draggedStudent = null;
let draggedFromClass = null;

// Mutual pairs tracking
let mutualPairs = [];
let pairSymbols = {};

// Available symbols for pairs
const availableSymbols = [
    '❤️', '💚', '💙', '💛', '💜', '🧡', '💖', '💗',
    '🔴', '🟢', '🔵', '🟡', '🟣', '🟠', '⚪', '⚫',
    '🌟', '⭐', '✨', '🌈', '🔥', '💎', '🌺', '🌸',
    '🍀', '🌻', '🌹', '🦋', '🐝', '🦄', '🐬', '🦁',
    '🟤', '🔶', '🔷', '🔲', '🟥', '🟧', '🟨', '🟩',
    '🟦', '🟪', '⬛️', '⬜️', '🟫', '♠️', '♣️', '♦️'
];

// Initialize event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // File upload handlers
    document.getElementById('wishesFile').addEventListener('change', handleWishesFile);
    document.getElementById('studentDataFile').addEventListener('change', handleStudentDataFile);
    
    // Checkbox handler for mutual pairs
    document.getElementById('showMutualPairs').addEventListener('change', function() {
        if (Object.keys(currentClasses).length > 0) {
            displayClasses();
        }
    });
    
    // Checkbox handler for fulfilled priority
    document.getElementById('showFulfilledPriority').addEventListener('change', function() {
        if (Object.keys(currentClasses).length > 0) {
            displayClasses();
        }
    });
});

// File handling functions
function handleWishesFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        parseCSV(event.target.result, 'wishes');
    };
    reader.readAsText(file);
}

function handleStudentDataFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        parseCSV(event.target.result, 'studentData');
    };
    reader.readAsText(file);
}

function parseCSV(csvText, type) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    
    if (type === 'wishes') {
        wishesData = data;
    } else {
        studentData = data;
    }
    
    checkIfReady();
}

function checkIfReady() {
    const generateBtn = document.getElementById('generateBtn');
    if (wishesData.length > 0 && studentData.length > 0) {
        generateBtn.disabled = false;
        showSuccess('Beide Dateien erfolgreich geladen!');
    }
}

// UI feedback functions
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => errorDiv.style.display = 'none', 5000);
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    setTimeout(() => successDiv.style.display = 'none', 3000);
}

// Main generation function
function generateClasses() {
    const classCount = parseInt(document.getElementById('classCount').value);
    const includeIgnored = document.getElementById('includeIgnored').checked;

    if (classCount < 2 || classCount > 10) {
        showError('Bitte wählen Sie zwischen 2 und 10 Klassen!');
        return;
    }

    // Separate or include ignored students based on checkbox
    let activeStudents, ignoredStudents;
    if (includeIgnored) {
        activeStudents = [...studentData];
        ignoredStudents = [];
    } else {
        ignoredStudents = studentData.filter(s => s['Ignorieren'] === 'j');
        activeStudents = studentData.filter(s => s['Ignorieren'] !== 'j');
    }
    
    if (activeStudents.length === 0) {
        showError('Keine aktiven Schüler gefunden!');
        return;
    }

    const constraints = getConstraintConfig();
    const extendedFeasibilityError = getExtendedConstraintFeasibilityError(activeStudents, classCount, constraints);
    if (extendedFeasibilityError) {
        showError(extendedFeasibilityError);
        return;
    }

    manualExclusionHighlightStudentIds.clear();
    manualExclusionHighlightPairs.clear();
    
    // Initialize classes dynamically
    currentClasses = {};
    const classLetters = 'ABCDEFGHIJ'.split('');
    for (let i = 0; i < classCount; i++) {
        currentClasses[`Klasse ${classLetters[i]}`] = [];
    }
    
    // Add ignored class if there are ignored students and checkbox is unchecked
    if (!includeIgnored && ignoredStudents.length > 0) {
        currentClasses['Ignorierte Schüler'] = ignoredStudents;
    }
    
    if (activeStudents.length > 0) {
        startContinuousOptimization(activeStudents);
    }
}

// Continuous optimization
function startContinuousOptimization(students) {
    optimizationRunning = true;
    iterations = 0;
    improvements = 0;
    optimizerStagnation = 0;
    bestScore = 0;
    bestClasses = null;

    const classNames = Object.keys(currentClasses).filter(name => name !== 'Ignorierte Schüler');
    const initialized = buildInitialFeasibleSolution(students, classNames);

    if (!initialized) {
        optimizationRunning = false;
        showError(initialSolutionFailureReason || 'Keine zulässige Startlösung gefunden. Bitte Grenzen lockern oder Klassenzahl erhöhen.');
        return;
    }

    // Bei teilzulässiger Startlösung als Hinweis (kein Fehler) anzeigen — die Optimierung
    // läuft trotzdem und wird die Verletzungen über den Score-Penalty reparieren.
    if (initialSolutionFailureReason) {
        showError(initialSolutionFailureReason);
    }

    document.getElementById('generateBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('resumeBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'inline-block';
    document.getElementById('optimizationStatus').style.display = 'block';

    bestClasses = JSON.parse(JSON.stringify(currentClasses));
    bestScore = calculateTotalScore();
    displayClasses();

    continuousOptimizationLoop(classNames);
}

function continuousOptimizationLoop(classNames) {
    if (!optimizationRunning) return;

    setTimeout(() => {
        iterations++;

        const improved = runBestFeasibleMoveIteration(classNames);

        if (improved) {
            optimizerStagnation = 0;
            const currentScore = calculateTotalScore();
            if (currentScore > bestScore) {
                bestScore = currentScore;
                bestClasses = JSON.parse(JSON.stringify(currentClasses));
                improvements++;
                displayClasses();
            }
        } else {
            optimizerStagnation++;
            if (optimizerStagnation >= 250) {
                applyFeasiblePerturbation(classNames, 4);
                optimizerStagnation = 0;
            }
        }

        document.getElementById('currentIterations').textContent = iterations;
        document.getElementById('currentScore').textContent = bestScore;
        document.getElementById('improvementRate').textContent =
            Math.round((improvements / iterations) * 100) + '%';

        continuousOptimizationLoop(classNames);
    }, 0);
}

function getConstraintConfig() {
    return {
        maxSameGender: parseInt(document.getElementById('maxSameGender').value) || 0,
        maxSameOldClass: parseInt(document.getElementById('maxSameOldClass').value) || 0,
        minSameOldClass: parseInt(document.getElementById('minSameOldClass').value) || 0,
        maxClassSize: parseInt(document.getElementById('maxClassSize').value) || 0,
        minClassSize: parseInt(document.getElementById('minClassSize').value) || 0,
        maxActive: parseInt(document.getElementById('maxActive').value) || 0,
        maxGrade1: parseInt(document.getElementById('maxGrade1').value) || 0,
        maxGrade3: parseInt(document.getElementById('maxGrade3').value) || 0,
        minDistinctOldClasses: parseInt(document.getElementById('minDistinctOldClasses').value) || 0,
        mutualWishOneRequired: document.getElementById('mutualWishOneRequired').checked || false
    };
}

function getExtendedConstraintFeasibilityError(activeStudents, classCount, constraints) {
    const totalStudents = activeStudents.length;

    if (constraints.maxClassSize > 0 && totalStudents > constraints.maxClassSize * classCount) {
        return `Unmögliche Verteilung: ${totalStudents} Schüler passen nicht in ${classCount} Klassen mit max. ${constraints.maxClassSize} pro Klasse.`;
    }

    if (constraints.minClassSize > 0 && totalStudents < constraints.minClassSize * classCount) {
        return `Unmögliche Verteilung: ${totalStudents} Schüler reichen nicht aus, um ${classCount} Klassen mit min. ${constraints.minClassSize} pro Klasse zu füllen.`;
    }

    const activeCount = activeStudents.filter(s => normalizeActivity(s) === 'a').length;
    if (constraints.maxActive > 0 && activeCount > constraints.maxActive * classCount) {
        return `Unmögliche Verteilung: ${activeCount} aktive Schüler überschreiten die Grenze von ${constraints.maxActive} pro Klasse bei ${classCount} Klassen.`;
    }

    const grade1Count = activeStudents.filter(s => normalizeGrade(s) === '1').length;
    if (constraints.maxGrade1 > 0 && grade1Count > constraints.maxGrade1 * classCount) {
        return `Unmögliche Verteilung: ${grade1Count} Schüler mit Notenbild 1 überschreiten die Grenze von ${constraints.maxGrade1} pro Klasse.`;
    }

    const grade3Count = activeStudents.filter(s => normalizeGrade(s) === '3').length;
    if (constraints.maxGrade3 > 0 && grade3Count > constraints.maxGrade3 * classCount) {
        return `Unmögliche Verteilung: ${grade3Count} Schüler mit Notenbild 3 überschreiten die Grenze von ${constraints.maxGrade3} pro Klasse.`;
    }

    if (constraints.minDistinctOldClasses > 0) {
        const distinctOldClasses = new Set(activeStudents.map(s => normalizeOldClass(s))).size;
        if (distinctOldClasses < constraints.minDistinctOldClasses) {
            return `Unmögliche Verteilung: Es gibt nur ${distinctOldClasses} unterschiedliche alte Klassen, gefordert sind aber mindestens ${constraints.minDistinctOldClasses} pro neuer Klasse.`;
        }
    }

    const genderCounts = {};
    const oldClassCounts = {};
    for (const student of activeStudents) {
        const gender = normalizeGender(student);
        const oldClass = normalizeOldClass(student);
        genderCounts[gender] = (genderCounts[gender] || 0) + 1;
        oldClassCounts[oldClass] = (oldClassCounts[oldClass] || 0) + 1;
    }

    if (constraints.maxSameGender > 0) {
        for (const gender in genderCounts) {
            if (Math.ceil(genderCounts[gender] / constraints.maxSameGender) > classCount) {
                return `Unmögliche Geschlechterverteilung: ${genderCounts[gender]} Schüler mit Geschlecht "${gender}" passen nicht in ${classCount} Klassen mit max. ${constraints.maxSameGender} pro Klasse.`;
            }
        }
    }

    if (constraints.maxSameOldClass > 0) {
        for (const oldClass in oldClassCounts) {
            if (Math.ceil(oldClassCounts[oldClass] / constraints.maxSameOldClass) > classCount) {
                return `Unmögliche Verteilung alter Klassen: ${oldClassCounts[oldClass]} Schüler aus Klasse "${oldClass}" passen nicht in ${classCount} Klassen mit max. ${constraints.maxSameOldClass} pro Klasse.`;
            }
        }
    }

    if (constraints.minSameOldClass > 1) {
        const undersizedOldClasses = [];
        for (const oldClass in oldClassCounts) {
            if (oldClassCounts[oldClass] > 0 && oldClassCounts[oldClass] < constraints.minSameOldClass) {
                undersizedOldClasses.push(`"${oldClass}" (${oldClassCounts[oldClass]})`);
            }
        }
        if (undersizedOldClasses.length > 0) {
            return `Unmögliche Mindestgrenze: Folgende alte Klassen haben weniger als ${constraints.minSameOldClass} Schüler und können die Regel nicht erfüllen: ${undersizedOldClasses.join(', ')}. Bitte Min-Wert reduzieren, betroffene Schüler ignorieren oder alte Klasse zusammenführen.`;
        }
    }

    if (constraints.maxClassSize > 0 && constraints.minSameOldClass > 1) {
        // Wenn maxClassSize so eng gewählt ist, dass nicht einmal der größte unvermeidbare
        // Chunk hineinpasst, ist die Konfiguration nicht erfüllbar.
        const maxChunkSize = computeMaxChunkSize(activeStudents, constraints.minSameOldClass);
        if (maxChunkSize > constraints.maxClassSize) {
            return `Unmögliche Verteilung: Eine alte Klasse erzeugt einen Block von ${maxChunkSize} Schülern, der nicht in eine neue Klasse mit max. ${constraints.maxClassSize} Schülern passt. Bitte Max-Klassengröße erhöhen oder Min-Wert reduzieren.`;
        }
    }

    return '';
}

function normalizeGender(student) {
    return (student['Geschlecht (m/w/d)'] || 'unbekannt').toString().trim().toLowerCase();
}

function normalizeOldClass(student) {
    return (student['Alte Klasse'] || 'unbekannt').toString().trim().toLowerCase();
}

function classHasExclusionConflict(studentsInClass) {
    for (let i = 0; i < studentsInClass.length; i++) {
        for (let j = i + 1; j < studentsInClass.length; j++) {
            if (isExcluded(studentsInClass[i], studentsInClass[j]) || isExcluded(studentsInClass[j], studentsInClass[i])) {
                return true;
            }
        }
    }
    return false;
}

function isExcludedByName(studentName1, studentName2) {
    const student1 = studentData.find(s => s['Schüler'] === studentName1);
    const student2 = studentData.find(s => s['Schüler'] === studentName2);
    if (!student1 || !student2) return false;
    return isExcluded(student1, student2) || isExcluded(student2, student1);
}

function normalizeActivity(student) {
    const activity = (student['Still (s) / Aktiv (a)'] || student['Still (s) / Lebendig (l)'] || '').toString().trim().toLowerCase();
    return activity === 'l' ? 'a' : activity;
}

function normalizeGrade(student) {
    return (student['Notenbild'] || student['Notenbild (1-3)'] || '').toString().trim();
}

function getManualExclusionPairKey(studentName1, studentName2) {
    return [studentName1, studentName2].sort((a, b) => a.localeCompare(b, 'de')).join('||');
}

function syncManualExclusionHighlightStudentIds() {
    manualExclusionHighlightStudentIds.clear();

    for (const pairKey of manualExclusionHighlightPairs) {
        const [studentName1, studentName2] = pairKey.split('||');
        if (studentName1) manualExclusionHighlightStudentIds.add(studentName1);
        if (studentName2) manualExclusionHighlightStudentIds.add(studentName2);
    }
}

function clearManualExclusionPairsForStudent(studentName) {
    for (const pairKey of [...manualExclusionHighlightPairs]) {
        const [studentName1, studentName2] = pairKey.split('||');
        if (studentName1 === studentName || studentName2 === studentName) {
            manualExclusionHighlightPairs.delete(pairKey);
        }
    }

    syncManualExclusionHighlightStudentIds();
}

function addManualExclusionPairsForStudentInClass(student, className) {
    const studentsInClass = currentClasses[className] || [];

    for (const classmate of studentsInClass) {
        if (classmate['Schüler'] === student['Schüler']) continue;
        if (isExcluded(student, classmate) || isExcluded(classmate, student)) {
            manualExclusionHighlightPairs.add(
                getManualExclusionPairKey(student['Schüler'], classmate['Schüler'])
            );
        }
    }

    syncManualExclusionHighlightStudentIds();
}
    manualExclusionHighlightPairs.clear();

function getForcedRelocateCompanions(fromClassName, student, constraints) {
    if (!constraints || constraints.minSameOldClass <= 1) {
        return [];
    }

    const sourceStudents = currentClasses[fromClassName] || [];
    const movedOldClass = normalizeOldClass(student);

    const sameOldClassStudents = sourceStudents.filter(
        s => normalizeOldClass(s) === movedOldClass
    );

    const remainingSameOldClassStudents = sameOldClassStudents.filter(
        s => s['Schüler'] !== student['Schüler']
    );

    if (remainingSameOldClassStudents.length === 0 ||
        remainingSameOldClassStudents.length >= constraints.minSameOldClass) {
        return [];
    }

    return remainingSameOldClassStudents;
}

function isClassValidByHardConstraints(studentsInClass, constraints, options = {}) {
    const checkMinimumRules = options.checkMinimumRules !== false;
    const genderCounts = {};
    const oldClassCounts = {};
    let activeCount = 0;
    let grade1Count = 0;
    let grade3Count = 0;
    const distinctOldClasses = new Set();

    for (const student of studentsInClass) {
        const gender = normalizeGender(student);
        const oldClass = normalizeOldClass(student);
        const activity = normalizeActivity(student);
        const grade = normalizeGrade(student);
        
        genderCounts[gender] = (genderCounts[gender] || 0) + 1;
        oldClassCounts[oldClass] = (oldClassCounts[oldClass] || 0) + 1;
        distinctOldClasses.add(oldClass);
        
        if (activity === 'a') activeCount++;
        if (grade === '1') grade1Count++;
        if (grade === '3') grade3Count++;
    }

    // Check maxSameGender
    if (constraints.maxSameGender > 0) {
        for (const gender in genderCounts) {
            if (genderCounts[gender] > constraints.maxSameGender) {
                return false;
            }
        }
    }

    // Check maxSameOldClass
    if (constraints.maxSameOldClass > 0) {
        for (const oldClass in oldClassCounts) {
            if (oldClassCounts[oldClass] > constraints.maxSameOldClass) {
                return false;
            }
        }
    }

    // Check minSameOldClass
    if (checkMinimumRules && constraints.minSameOldClass > 1) {
        for (const oldClass in oldClassCounts) {
            if (oldClassCounts[oldClass] > 0 && oldClassCounts[oldClass] < constraints.minSameOldClass) {
                return false;
            }
        }
    }

    // Check maxClassSize
    if (constraints.maxClassSize > 0 && studentsInClass.length > constraints.maxClassSize) {
        return false;
    }

    // Check minClassSize
    if (checkMinimumRules && constraints.minClassSize > 0 && studentsInClass.length < constraints.minClassSize) {
        return false;
    }

    // Check maxActive
    if (constraints.maxActive > 0 && activeCount > constraints.maxActive) {
        return false;
    }

    // Check maxGrade1
    if (constraints.maxGrade1 > 0 && grade1Count > constraints.maxGrade1) {
        return false;
    }

    // Check maxGrade3
    if (constraints.maxGrade3 > 0 && grade3Count > constraints.maxGrade3) {
        return false;
    }

    // Check minDistinctOldClasses
    if (checkMinimumRules && constraints.minDistinctOldClasses > 0 && distinctOldClasses.size < constraints.minDistinctOldClasses) {
        return false;
    }

    return !classHasExclusionConflict(studentsInClass);
}

function isMutualWishPair(student1Name, student2Name) {
    const wishes1 = wishesData.find(w => w['Schüler'] === student1Name);
    const wishes2 = wishesData.find(w => w['Schüler'] === student2Name);
    
    if (!wishes1 || !wishes2) return false;
    
    // Check if both wish for each other as Wunsch 1
    return wishes1['Wunsch 1 - Höchste Priorität'] === student2Name && 
           wishes2['Wunsch 1 - Höchste Priorität'] === student1Name;
}

function checkMutualWishOneConstraint(classNames, constraints) {
    if (!constraints.mutualWishOneRequired) return true;
    
    // Build a map of all students to their classes
    const studentToClass = {};
    for (const className of classNames) {
        for (const student of currentClasses[className]) {
            studentToClass[student['Schüler']] = className;
        }
    }
    
    // Check each mutual wish pair
    for (const wishesRecord of wishesData) {
        const student1 = wishesRecord['Schüler'];
        const student2 = wishesRecord['Wunsch 1 - Höchste Priorität'];
        
        if (!student1 || !student2) continue;
        if (!isMutualWishPair(student1, student2)) continue;
        
        // Check if we've already checked this pair (avoid double-checking)
        if (student1 > student2) continue;
        
        const class1 = studentToClass[student1];
        const class2 = studentToClass[student2];
        
        // If either student is not assigned (excluded/ignored), that's okay
        if (!class1 || !class2 || class1 === 'Ignorierte Schüler' || class2 === 'Ignorierte Schüler') {
            continue;
        }
        
        // Check if they're excluded from each other
        if (isExcludedByName(student1, student2)) {
            continue; // Exclusion takes precedence
        }
        
        // They must be in the same class
        if (class1 !== class2) {
            return false;
        }
    }
    
    return true;
}

function isEntireAssignmentFeasible(classNames, constraints) {
    for (const className of classNames) {
        if (!isClassValidByHardConstraints(currentClasses[className], constraints)) {
            return false;
        }
    }
    // Check mutual wish constraint across all classes
    if (!checkMutualWishOneConstraint(classNames, constraints)) {
        return false;
    }
    return true;
}

function getMutualWishOnePartnerMap(students, constraints) {
    const partnerMap = new Map();
    if (!constraints.mutualWishOneRequired) return partnerMap;

    const studentSet = new Set(students.map(s => s['Schüler']));

    for (const wishesRecord of wishesData) {
        const student1 = wishesRecord['Schüler'];
        const student2 = wishesRecord['Wunsch 1 - Höchste Priorität'];

        if (!student1 || !student2) continue;
        if (!studentSet.has(student1) || !studentSet.has(student2)) continue;
        if (!isMutualWishPair(student1, student2)) continue;
        if (isExcludedByName(student1, student2)) continue;

        partnerMap.set(student1, student2);
        partnerMap.set(student2, student1);
    }

    return partnerMap;
}

function buildInitialFeasibleSolution(students, classNames) {
    const constraints = getConstraintConfig();
    const studentsPerClassTarget = Math.ceil(students.length / classNames.length);
    const configuredMax = constraints.maxClassSize > 0 ? constraints.maxClassSize : Infinity;
    // buildPlacementUnits kann bei fullChunks=1 einen Chunk mit bis zu 2*min-1 Schülern erzeugen
    // (alle Reste landen in chunks[0]). Wir berechnen die tatsächlich auftretende größte Chunk-Größe
    // aus den Daten, damit der Headroom passt — sonst kann die Greedy-Platzierung den Mega-Chunk
    // nirgendwo unterbringen und alle 120 Versuche scheitern.
    const maxChunkSize = computeMaxChunkSize(students, constraints.minSameOldClass);
    const algorithmicHeadroom = studentsPerClassTarget + maxChunkSize + 1;
    const maxClassSize = Math.min(configuredMax, algorithmicHeadroom);
    const partnerMap = getMutualWishOnePartnerMap(students, constraints);
    const seedBase = getDeterministicSeed(students);

    initialSolutionFailureReason = '';
    let fallbackCandidate = null;
    let fallbackPenalty = Infinity;

    for (let attempt = 0; attempt < 120; attempt++) {
        classNames.forEach(name => currentClasses[name] = []);

        const placementUnits = buildPlacementUnits(students, constraints, seedBase + attempt);
        if (!placementUnits) {
            if (!initialSolutionFailureReason) {
                initialSolutionFailureReason = 'Unmögliche Mindestgrenze: Mindestens eine alte Klasse hat weniger Schüler als die geforderte Mindestzahl.';
            }
            return false;
        }

        let placementFailed = false;
        const assignedClassByStudent = new Map();

        for (const unit of placementUnits) {
            // Zähle Partner-Hits pro Klasse (Mutual-Wish-Soft-Constraint). Wir blockieren
            // NICHT mehr bei Konflikten — wenn mehrere Schüler im Chunk Partner in
            // verschiedenen Klassen haben, wählen wir die Klasse mit den meisten Hits und
            // akzeptieren, dass einzelne Partner getrennt bleiben. Die Verletzung fließt
            // als Score-Penalty in die Optimierungsphase ein.
            const partnerHitsByClass = {};
            for (const student of unit) {
                const partner = partnerMap.get(student['Schüler']);
                if (!partner) continue;
                if (unit.some(u => u['Schüler'] === partner)) continue;
                const partnerClass = assignedClassByStudent.get(partner);
                if (partnerClass) {
                    partnerHitsByClass[partnerClass] = (partnerHitsByClass[partnerClass] || 0) + 1;
                }
            }

            const candidates = classNames
                .filter(className => {
                    if (currentClasses[className].length + unit.length > maxClassSize) return false;
                    const simulatedClass = [...currentClasses[className], ...unit];
                    return isClassValidByHardConstraints(simulatedClass, constraints, { checkMinimumRules: false });
                })
                .sort((a, b) => {
                    // 1. Partner-Hits zuerst — höchste Soft-Priorität, damit Mutual-Pairs zusammenbleiben.
                    const hitsA = partnerHitsByClass[a] || 0;
                    const hitsB = partnerHitsByClass[b] || 0;
                    if (hitsA !== hitsB) return hitsB - hitsA;

                    // 2. Wenig Schüler aus derselben alten Klasse (Spreiz-Logik).
                    const unitOldClass = normalizeOldClass(unit[0] || {});
                    const sameOldClassCountA = currentClasses[a].filter(s => normalizeOldClass(s) === unitOldClass).length;
                    const sameOldClassCountB = currentClasses[b].filter(s => normalizeOldClass(s) === unitOldClass).length;
                    if (sameOldClassCountA !== sameOldClassCountB) {
                        return sameOldClassCountA - sameOldClassCountB;
                    }

                    // 3. Klasse mit weniger Schülern (Balance).
                    if (currentClasses[a].length !== currentClasses[b].length) {
                        return currentClasses[a].length - currentClasses[b].length;
                    }

                    // 4. Bestmöglicher Wunsch-Score in der Klasse.
                    const scoreA = unit.reduce((acc, s) => acc + calculateWishScore(s, currentClasses[a]), 0);
                    const scoreB = unit.reduce((acc, s) => acc + calculateWishScore(s, currentClasses[b]), 0);
                    return scoreB - scoreA;
                });

            if (candidates.length === 0) {
                placementFailed = true;
                break;
            }

            currentClasses[candidates[0]].push(...unit);
            for (const student of unit) {
                assignedClassByStudent.set(student['Schüler'], candidates[0]);
            }
        }

        if (placementFailed) continue;

        const isFeasible = isEntireAssignmentFeasible(classNames, constraints);
        if (isFeasible) {
            return true;
        }

        const penalty = calculateHardConstraintPenalty(classNames, constraints);
        if (penalty < fallbackPenalty) {
            fallbackPenalty = penalty;
            fallbackCandidate = JSON.parse(JSON.stringify(currentClasses));
        }
    }

    if (fallbackCandidate) {
        // Greedy hat keine voll zulässige Lösung gefunden, aber die beste teilzulässige
        // hier ist max-zulässig (kein placementFailed). Min-Verletzungen werden in Phase B
        // über den Score-Penalty repariert.
        currentClasses = fallbackCandidate;
        initialSolutionFailureReason = describeMinViolationsForReason(classNames, constraints);
        return true;
    }

    if (!initialSolutionFailureReason) {
        initialSolutionFailureReason = 'Keine zulässige Startlösung gefunden. Vermutlich blockieren Ausschluss-Regeln oder enge Max-Grenzen die Platzierung. Bitte Grenzen lockern, Ausschlüsse prüfen oder Klassenzahl erhöhen.';
    }

    return false;
}

function describeMinViolationsForReason(classNames, constraints) {
    const violations = [];

    for (const className of classNames) {
        const studentsInClass = currentClasses[className];
        const oldClassCounts = {};
        const distinctOldClasses = new Set();
        for (const student of studentsInClass) {
            const oldClass = normalizeOldClass(student);
            oldClassCounts[oldClass] = (oldClassCounts[oldClass] || 0) + 1;
            distinctOldClasses.add(oldClass);
        }

        if (constraints.minSameOldClass > 1) {
            for (const oldClass in oldClassCounts) {
                const count = oldClassCounts[oldClass];
                if (count > 0 && count < constraints.minSameOldClass) {
                    violations.push(`${className}: nur ${count} Schüler aus alter Klasse "${oldClass}" (Min: ${constraints.minSameOldClass})`);
                }
            }
        }

        if (constraints.minClassSize > 0 && studentsInClass.length < constraints.minClassSize) {
            violations.push(`${className}: nur ${studentsInClass.length} Schüler (Min: ${constraints.minClassSize})`);
        }

        if (constraints.minDistinctOldClasses > 0 && distinctOldClasses.size < constraints.minDistinctOldClasses) {
            violations.push(`${className}: nur ${distinctOldClasses.size} verschiedene alte Klassen (Min: ${constraints.minDistinctOldClasses})`);
        }
    }

    if (constraints.mutualWishOneRequired) {
        const studentToClass = {};
        for (const className of classNames) {
            for (const student of currentClasses[className]) {
                studentToClass[student['Schüler']] = className;
            }
        }
        let splitPairCount = 0;
        for (const wishesRecord of wishesData) {
            const s1 = wishesRecord['Schüler'];
            const s2 = wishesRecord['Wunsch 1 - Höchste Priorität'];
            if (!s1 || !s2 || s1 > s2) continue;
            if (!isMutualWishPair(s1, s2)) continue;
            const c1 = studentToClass[s1];
            const c2 = studentToClass[s2];
            if (!c1 || !c2) continue;
            if (isExcludedByName(s1, s2)) continue;
            if (c1 !== c2) splitPairCount++;
        }
        if (splitPairCount > 0) {
            violations.push(`${splitPairCount} gegenseitige Wunsch-Paare noch getrennt`);
        }
    }

    if (violations.length === 0) return '';
    const head = violations.slice(0, 4).join('; ');
    const more = violations.length > 4 ? ` … (+${violations.length - 4} weitere)` : '';
    return `Hinweis: Startlösung hat Verletzungen, die der Optimizer reparieren wird — ${head}${more}.`;
}

function getDeterministicSeed(students) {
    const key = students
        .map(s => s['Schüler'] || '')
        .sort((a, b) => a.localeCompare(b, 'de'))
        .join('|');

    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return Math.abs(hash);
}

function getConstructionOrder(students, seed) {
    const oldClassCounts = {};
    students.forEach(student => {
        const oldClass = normalizeOldClass(student);
        oldClassCounts[oldClass] = (oldClassCounts[oldClass] || 0) + 1;
    });

    return [...students].sort((a, b) => {
        const exclusionWeightA = ['Ausschluss 1', 'Ausschluss 2', 'Ausschluss 3', 'Ausschluss 4']
            .filter(key => a[key]).length;
        const exclusionWeightB = ['Ausschluss 1', 'Ausschluss 2', 'Ausschluss 3', 'Ausschluss 4']
            .filter(key => b[key]).length;

        if (exclusionWeightB !== exclusionWeightA) {
            return exclusionWeightB - exclusionWeightA;
        }

        const oldClassWeightA = oldClassCounts[normalizeOldClass(a)] || 0;
        const oldClassWeightB = oldClassCounts[normalizeOldClass(b)] || 0;
        if (oldClassWeightA !== oldClassWeightB) {
            return oldClassWeightA - oldClassWeightB;
        }

        const noiseA = deterministicNoise(a['Schüler'] || '', seed);
        const noiseB = deterministicNoise(b['Schüler'] || '', seed);
        return noiseA - noiseB;
    });
}

function deterministicNoise(input, seed) {
    // Wichtig: Der Seed darf nicht einfach an `input` angehängt werden, sonst kürzt
    // er sich beim Vergleich zweier Schüler heraus (gleiche Gewichte am Ende des
    // gehashten Strings). Resultat wäre eine seedinvariante Sortierung — die 120
    // Startlösungs-Versuche wären faktisch identisch.
    let hash = Math.imul((seed | 0) || 0, 2654435761);
    for (let i = 0; i < input.length; i++) {
        hash = (((hash << 5) - hash) + input.charCodeAt(i)) | 0;
        hash ^= hash >>> 13;
    }
    return hash | 0;
}

function computeMaxChunkSize(students, minSameOldClass) {
    if (minSameOldClass <= 1) return 1;

    const sizesByOldClass = {};
    for (const student of students) {
        const oldClass = normalizeOldClass(student);
        sizesByOldClass[oldClass] = (sizesByOldClass[oldClass] || 0) + 1;
    }

    let maxSize = minSameOldClass;
    for (const oldClass in sizesByOldClass) {
        const groupSize = sizesByOldClass[oldClass];
        if (groupSize < minSameOldClass) continue;
        const fullChunks = Math.floor(groupSize / minSameOldClass);
        const remainder = groupSize % minSameOldClass;
        // Beim Verteilen des Rests via i % fullChunks kann ein einzelner Chunk
        // bis zu ceil(remainder / fullChunks) zusätzliche Schüler erhalten.
        const extras = fullChunks > 0 ? Math.ceil(remainder / fullChunks) : 0;
        const chunkMax = minSameOldClass + extras;
        if (chunkMax > maxSize) maxSize = chunkMax;
    }

    return maxSize;
}

function buildPlacementUnits(students, constraints, seed) {
    if (constraints.minSameOldClass <= 1) {
        return getConstructionOrder(students, seed).map(student => [student]);
    }

    const byOldClass = {};
    for (const student of students) {
        const oldClass = normalizeOldClass(student);
        if (!byOldClass[oldClass]) byOldClass[oldClass] = [];
        byOldClass[oldClass].push(student);
    }

    const chunksByOldClass = {};

    for (const oldClass in byOldClass) {
        const group = [...byOldClass[oldClass]].sort((a, b) => {
            const noiseA = deterministicNoise(a['Schüler'] || '', seed);
            const noiseB = deterministicNoise(b['Schüler'] || '', seed);
            return noiseA - noiseB;
        });

        if (group.length < constraints.minSameOldClass) {
            return null;
        }

        const chunkSize = constraints.minSameOldClass;
        const fullChunks = Math.floor(group.length / chunkSize);
        const remainder = group.length % chunkSize;
        const chunks = [];

        for (let i = 0; i < fullChunks; i++) {
            const start = i * chunkSize;
            chunks.push(group.slice(start, start + chunkSize));
        }

        for (let i = 0; i < remainder; i++) {
            chunks[i % chunks.length].push(group[fullChunks * chunkSize + i]);
        }

        chunksByOldClass[oldClass] = chunks;
    }

    // Reihenfolge der alten Klassen pro Versuch variieren, damit nicht immer
    // dieselben Klassen zuerst platziert werden. Größte Gruppen zuerst (sie sind
    // der limitierende Faktor); bei gleicher Größe seedabhängig per Noise.
    const orderedOldClasses = Object.keys(chunksByOldClass).sort((a, b) => {
        const sizeA = byOldClass[a].length;
        const sizeB = byOldClass[b].length;
        if (sizeA !== sizeB) return sizeB - sizeA;
        return deterministicNoise(a, seed) - deterministicNoise(b, seed);
    });
    const units = [];
    let added = true;

    while (added) {
        added = false;

        for (const oldClass of orderedOldClasses) {
            const chunk = chunksByOldClass[oldClass].shift();
            if (chunk) {
                units.push(chunk);
                added = true;
            }
        }
    }

    return units;
}

function calculateHardConstraintPenalty(classNames, constraints) {
    let penalty = 0;

    for (const className of classNames) {
        const studentsInClass = currentClasses[className];
        const genderCounts = {};
        const oldClassCounts = {};
        let activeCount = 0;
        let grade1Count = 0;
        let grade3Count = 0;
        const distinctOldClasses = new Set();

        studentsInClass.forEach(student => {
            const gender = normalizeGender(student);
            const oldClass = normalizeOldClass(student);
            const activity = normalizeActivity(student);
            const grade = normalizeGrade(student);
            genderCounts[gender] = (genderCounts[gender] || 0) + 1;
            oldClassCounts[oldClass] = (oldClassCounts[oldClass] || 0) + 1;
            distinctOldClasses.add(oldClass);

            if (activity === 'a') activeCount++;
            if (grade === '1') grade1Count++;
            if (grade === '3') grade3Count++;
        });

        if (constraints.maxSameGender > 0) {
            Object.values(genderCounts).forEach(count => {
                if (count > constraints.maxSameGender) {
                    penalty += (count - constraints.maxSameGender) * 100;
                }
            });
        }

        if (constraints.maxSameOldClass > 0) {
            Object.values(oldClassCounts).forEach(count => {
                if (count > constraints.maxSameOldClass) {
                    penalty += (count - constraints.maxSameOldClass) * 100;
                }
            });
        }

        if (constraints.minSameOldClass > 1) {
            Object.values(oldClassCounts).forEach(count => {
                if (count > 0 && count < constraints.minSameOldClass) {
                    penalty += (constraints.minSameOldClass - count) * 70;
                }
            });
        }

        if (constraints.maxClassSize > 0 && studentsInClass.length > constraints.maxClassSize) {
            penalty += (studentsInClass.length - constraints.maxClassSize) * 120;
        }

        if (constraints.minClassSize > 0 && studentsInClass.length < constraints.minClassSize) {
            penalty += (constraints.minClassSize - studentsInClass.length) * 90;
        }

        if (constraints.maxActive > 0 && activeCount > constraints.maxActive) {
            penalty += (activeCount - constraints.maxActive) * 90;
        }

        if (constraints.maxGrade1 > 0 && grade1Count > constraints.maxGrade1) {
            penalty += (grade1Count - constraints.maxGrade1) * 90;
        }

        if (constraints.maxGrade3 > 0 && grade3Count > constraints.maxGrade3) {
            penalty += (grade3Count - constraints.maxGrade3) * 90;
        }

        if (constraints.minDistinctOldClasses > 0 && distinctOldClasses.size < constraints.minDistinctOldClasses) {
            penalty += (constraints.minDistinctOldClasses - distinctOldClasses.size) * 80;
        }

        if (classHasExclusionConflict(studentsInClass)) {
            penalty += 200;
        }
    }

    if (constraints.mutualWishOneRequired) {
        // Proportional zur Anzahl getrennter Paare, damit der Fallback-Vergleich die
        // Lösung mit den wenigsten getrennten Paaren bevorzugt.
        const studentToClass = {};
        for (const className of classNames) {
            for (const student of currentClasses[className]) {
                studentToClass[student['Schüler']] = className;
            }
        }
        for (const wishesRecord of wishesData) {
            const s1 = wishesRecord['Schüler'];
            const s2 = wishesRecord['Wunsch 1 - Höchste Priorität'];
            if (!s1 || !s2 || s1 > s2) continue;
            if (!isMutualWishPair(s1, s2)) continue;
            const c1 = studentToClass[s1];
            const c2 = studentToClass[s2];
            if (!c1 || !c2) continue;
            if (isExcludedByName(s1, s2)) continue;
            if (c1 !== c2) penalty += 60;
        }
    }

    return penalty;
}

function runBestFeasibleMoveIteration(classNames) {
    const constraints = getConstraintConfig();
    const currentScore = calculateTotalScore();
    let bestMove = null;
    let bestDelta = 0;

    const moveCandidates = generateMoveCandidates(classNames, 80);

    for (const candidate of moveCandidates) {
        if (candidate.type === 'swap') {
            if (!isFeasibleSwapMove(candidate, constraints)) continue;

            applySwapMove(candidate);
            const newScore = calculateTotalScore();
            revertSwapMove(candidate);

            const delta = newScore - currentScore;
            if (delta > bestDelta) {
                bestDelta = delta;
                bestMove = candidate;
            }
        } else {
            if (!isFeasibleRelocateMove(candidate, constraints)) continue;

            applyRelocateMove(candidate);
            const newScore = calculateTotalScore();
            revertRelocateMove(candidate);

            const delta = newScore - currentScore;
            if (delta > bestDelta) {
                bestDelta = delta;
                bestMove = candidate;
            }
        }
    }

    if (!bestMove) {
        return false;
    }

    if (bestMove.type === 'swap') {
        applySwapMove(bestMove);
    } else {
        applyRelocateMove(bestMove);
    }

    return true;
}

function generateMoveCandidates(classNames, sampleSize) {
    const constraints = getConstraintConfig();
    const candidates = [];

    for (let i = 0; i < sampleSize; i++) {
        const class1 = classNames[Math.floor(Math.random() * classNames.length)];
        const class2 = classNames[Math.floor(Math.random() * classNames.length)];

        if (class1 === class2) continue;
        if (currentClasses[class1].length === 0) continue;

        const student1 = currentClasses[class1][Math.floor(Math.random() * currentClasses[class1].length)];
        if (!student1) continue;

        if (Math.random() < 0.55 && currentClasses[class2].length > 0) {
            const student2 = currentClasses[class2][Math.floor(Math.random() * currentClasses[class2].length)];
            if (!student2) continue;

            candidates.push({
                type: 'swap',
                class1,
                class2,
                student1,
                student2
            });
        } else {
            candidates.push({
                type: 'relocate',
                fromClass: class1,
                toClass: class2,
                student: student1,
                companions: getForcedRelocateCompanions(class1, student1, constraints)
            });
        }
    }

    return candidates;
}

function isFeasibleSwapMove(move, constraints) {
    const sourceAfter = currentClasses[move.class1].filter(s => s['Schüler'] !== move.student1['Schüler']);
    sourceAfter.push(move.student2);

    const targetAfter = currentClasses[move.class2].filter(s => s['Schüler'] !== move.student2['Schüler']);
    targetAfter.push(move.student1);

    // Penalty-Delta-Vergleich: Moves sind erlaubt, solange sie die Max-Constraint- und
    // Ausschluss-Penalty der betroffenen Klassen NICHT verschlechtern. Damit kann der
    // Optimizer einen bereits verletzten Zustand (z.B. nach Constraint-Verschärfung
    // während Pause) schrittweise reparieren — er ist nicht mehr hart blockiert.
    // Min/Mutual-Constraints sind ausschließlich Score-Penalty, daher hier nicht enthalten.
    const before = calculateClassMaxPenalty(currentClasses[move.class1], constraints) +
                   calculateClassMaxPenalty(currentClasses[move.class2], constraints);
    const after = calculateClassMaxPenalty(sourceAfter, constraints) +
                  calculateClassMaxPenalty(targetAfter, constraints);
    if (after > before) return false;

    return true;
}

function isFeasibleRelocateMove(move, constraints) {
    const movedStudents = [move.student, ...(move.companions || [])];
    const movedStudentIds = new Set(movedStudents.map(s => s['Schüler']));

    const sourceAfter = currentClasses[move.fromClass].filter(
        s => !movedStudentIds.has(s['Schüler'])
    );
    const targetAfter = [...currentClasses[move.toClass], ...movedStudents];

    // Siehe isFeasibleSwapMove — Penalty-Delta-Vergleich statt harter Block, damit
    // Reparatur möglich ist.
    const before = calculateClassMaxPenalty(currentClasses[move.fromClass], constraints) +
                   calculateClassMaxPenalty(currentClasses[move.toClass], constraints);
    const after = calculateClassMaxPenalty(sourceAfter, constraints) +
                  calculateClassMaxPenalty(targetAfter, constraints);
    if (after > before) return false;

    return true;
}

function applySwapMove(move) {
    const idx1 = currentClasses[move.class1].findIndex(s => s['Schüler'] === move.student1['Schüler']);
    const idx2 = currentClasses[move.class2].findIndex(s => s['Schüler'] === move.student2['Schüler']);
    if (idx1 === -1 || idx2 === -1) return;

    currentClasses[move.class1][idx1] = move.student2;
    currentClasses[move.class2][idx2] = move.student1;
}

function revertSwapMove(move) {
    const idx1 = currentClasses[move.class1].findIndex(s => s['Schüler'] === move.student2['Schüler']);
    const idx2 = currentClasses[move.class2].findIndex(s => s['Schüler'] === move.student1['Schüler']);
    if (idx1 === -1 || idx2 === -1) return;

    currentClasses[move.class1][idx1] = move.student1;
    currentClasses[move.class2][idx2] = move.student2;
}

function applyRelocateMove(move) {
    const studentsToMove = [move.student, ...(move.companions || [])];
    const uniqueStudentsToMove = [];
    const seen = new Set();

    for (const student of studentsToMove) {
        if (!student || seen.has(student['Schüler'])) continue;
        seen.add(student['Schüler']);
        uniqueStudentsToMove.push(student);
    }

    const movedIds = new Set(uniqueStudentsToMove.map(s => s['Schüler']));
    const sourceBefore = currentClasses[move.fromClass];
    move._appliedStudents = sourceBefore.filter(s => movedIds.has(s['Schüler']));

    currentClasses[move.fromClass] = sourceBefore.filter(
        s => !movedIds.has(s['Schüler'])
    );
    currentClasses[move.toClass].push(...move._appliedStudents);
}

function revertRelocateMove(move) {
    const appliedStudents = move._appliedStudents || [move.student, ...(move.companions || [])];
    const movedIds = new Set(appliedStudents.map(s => s['Schüler']));

    currentClasses[move.toClass] = currentClasses[move.toClass].filter(
        s => !movedIds.has(s['Schüler'])
    );
    currentClasses[move.fromClass].push(...appliedStudents);

    delete move._appliedStudents;
}

function applyFeasiblePerturbation(classNames, moveCount) {
    const constraints = getConstraintConfig();

    if (bestClasses) {
        currentClasses = JSON.parse(JSON.stringify(bestClasses));
    }

    let applied = 0;
    let tries = 0;
    const maxTries = moveCount * 30;

    while (applied < moveCount && tries < maxTries) {
        tries++;
        const candidates = generateMoveCandidates(classNames, 1);
        if (candidates.length === 0) continue;

        const move = candidates[0];
        if (move.type === 'swap') {
            if (!isFeasibleSwapMove(move, constraints)) continue;
            applySwapMove(move);
            applied++;
        } else {
            if (!isFeasibleRelocateMove(move, constraints)) continue;
            applyRelocateMove(move);
            applied++;
        }
    }
}

function stopOptimization() {
    optimizationRunning = false;

    if (bestClasses) {
        currentClasses = bestClasses;
        displayClasses();
    }

    document.getElementById('generateBtn').style.display = 'inline-block';
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('resumeBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('optimizationStatus').style.display = 'none';

    showSuccess(`Optimierung beendet! Beste Lösung: Score ${bestScore} nach ${iterations} Iterationen`);
}

function pauseOptimization() {
    if (!optimizationRunning) return;
    optimizationRunning = false;

    // Aktuell beste Lösung sofort anzeigen, damit beim Pause-Stand keine
    // Greedy-Restzustände sichtbar bleiben.
    if (bestClasses) {
        currentClasses = JSON.parse(JSON.stringify(bestClasses));
        displayClasses();
    }

    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('resumeBtn').style.display = 'inline-block';
    showSuccess('Optimierung pausiert. Verteilungsregeln können nun verändert werden — beim Fortsetzen werden die neuen Werte berücksichtigt.');
}

function resumeOptimization() {
    if (optimizationRunning) return;

    // Constraints werden ohnehin pro Iteration via getConstraintConfig() frisch von der UI
    // gelesen. Hier nur den aktuellen Score/Best-State unter den neuen Werten neu berechnen.
    bestScore = calculateTotalScore();
    bestClasses = JSON.parse(JSON.stringify(currentClasses));
    optimizationRunning = true;
    optimizerStagnation = 0;

    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('resumeBtn').style.display = 'none';
    document.getElementById('currentScore').textContent = bestScore;

    const classNames = Object.keys(currentClasses).filter(name => name !== 'Ignorierte Schüler');
    continuousOptimizationLoop(classNames);
}

// Helper functions
function isExcluded(student1, student2) {
    const exclusions = ['Ausschluss 1', 'Ausschluss 2', 'Ausschluss 3', 'Ausschluss 4'];
    for (const exc of exclusions) {
        if (student1[exc] === student2['Schüler']) {
            return true;
        }
    }
    return false;
}

// Read activity value from either supported column header and normalize aliases
function getStudentActivityType(student) {
    const rawValue = (
        student['Still (s) / Aktiv (a)'] ||
        student['Still (s) / Lebendig (l)'] ||
        ''
    ).toString().trim().toLowerCase();

    if (rawValue === 'l') return 'a';
    if (rawValue === 's' || rawValue === 'a') return rawValue;

    return 'unbekannt';
}

// Find mutual highest priority pairs
function findMutualPairs() {
    mutualPairs = [];
    pairSymbols = {};
    
    // Find all mutual wishes with highest priority
    for (let i = 0; i < wishesData.length; i++) {
        const student1Wishes = wishesData[i];
        const student1Name = student1Wishes['Schüler'];
        const student1HighestWish = student1Wishes['Wunsch 1 - Höchste Priorität'];
        
        if (!student1HighestWish) continue;
        
        // Check if the wished student also wishes for student1 as highest priority
        const student2Wishes = wishesData.find(w => w['Schüler'] === student1HighestWish);
        if (student2Wishes && student2Wishes['Wunsch 1 - Höchste Priorität'] === student1Name) {
            // Check if this pair is not already recorded (avoid duplicates)
            const pairExists = mutualPairs.some(pair => 
                (pair[0] === student1Name && pair[1] === student1HighestWish) ||
                (pair[0] === student1HighestWish && pair[1] === student1Name)
            );
            
            if (!pairExists) {
                mutualPairs.push([student1Name, student1HighestWish]);
            }
        }
    }
    
    // Assign unique symbols to each pair
    mutualPairs.forEach((pair, index) => {
        if (index < availableSymbols.length) {
            const symbol = availableSymbols[index];
            pairSymbols[pair[0]] = symbol;
            pairSymbols[pair[1]] = symbol;
        }
    });
}

function calculateWishScore(student, classmates) {
    const wishes = wishesData.find(w => w['Schüler'] === student['Schüler']);
    if (!wishes) return 0;

    const classmateNames = classmates.map(c => c['Schüler']);

    // Return score of highest fulfilled wish priority only
    if (classmateNames.includes(wishes['Wunsch 1 - Höchste Priorität'])) {
        return 3;
    } else if (classmateNames.includes(wishes['Wunsch 2 - Zweithöchste Priorität'])) {
        return 2;
    } else if (classmateNames.includes(wishes['Wunsch 3 - Dritthöchste Priorität'])) {
        return 1;
    }

    return 0;
}

function studentHasAnyWish(student) {
    const wishes = wishesData.find(w => w['Schüler'] === student['Schüler']);
    if (!wishes) return false;
    return Boolean(
        wishes['Wunsch 1 - Höchste Priorität'] ||
        wishes['Wunsch 2 - Zweithöchste Priorität'] ||
        wishes['Wunsch 3 - Dritthöchste Priorität']
    );
}

function calculateTotalScore() {
    let totalScore = 0;
    let scoreBreakdown = {
        wishes: 0,
        unfulfilledWishes: 0,
        gender: 0,
        activity: 0,
        grades: 0,
        oldClass: 0,
        balance: 0,
        minViolations: 0
    };

    const classNames = Object.keys(currentClasses).filter(name => name !== 'Ignorierte Schüler');

    // Wishes score + Penalty für Schüler ganz ohne erfüllten Wunsch
    // Differenz zwischen "ein Wunsch erfüllt" und "keiner erfüllt" soll wesentlich
    // größer wiegen als die Stufen 1/2/3 untereinander.
    const PENALTY_NO_WISH_FULFILLED = 100;
    let unfulfilledPenalty = 0;
    for (const className in currentClasses) {
        if (className === 'Ignorierte Schüler') continue;

        for (const student of currentClasses[className]) {
            const wishScoreRaw = calculateWishScore(student, currentClasses[className]);
            const wishScore = wishScoreRaw * 10;
            totalScore += wishScore;
            scoreBreakdown.wishes += wishScore;

            if (wishScoreRaw === 0 && studentHasAnyWish(student)) {
                unfulfilledPenalty += PENALTY_NO_WISH_FULFILLED;
            }
        }
    }
    scoreBreakdown.unfulfilledWishes = -unfulfilledPenalty;
    totalScore -= unfulfilledPenalty;

    // Calculate distribution scores
    const distributions = calculateDistributions(classNames);

    scoreBreakdown.gender = Math.round((1 - distributions.gender.variance) * 50);
    scoreBreakdown.activity = Math.round((1 - distributions.activity.variance) * 40);
    scoreBreakdown.grades = Math.round((1 - distributions.grades.variance) * 30);
    scoreBreakdown.oldClass = Math.round((1 - distributions.oldClass.variance) * 40);
    scoreBreakdown.balance = Math.round((1 - distributions.sizeVariance) * 30);

    totalScore += scoreBreakdown.gender + scoreBreakdown.activity +
                 scoreBreakdown.grades + scoreBreakdown.oldClass + scoreBreakdown.balance;

    // Penalty für verletzte Min-Constraints (minSameOldClass, minClassSize, minDistinctOldClasses).
    // Stark genug, dass jede Reparatur den Score eindeutig hebt — der Optimizer beseitigt
    // Verletzungen damit aktiv, statt von ihnen blockiert zu werden.
    const constraints = getConstraintConfig();
    const minPenalty = calculateMinConstraintPenalty(classNames, constraints);
    scoreBreakdown.minViolations = -minPenalty;
    totalScore -= minPenalty;

    // Max-Constraint-Penalty: damit nach Pause+Constraint-Verschärfung der Optimizer
    // bestehende Verletzungen reparieren kann, statt blockiert zu sein.
    const maxPenalty = calculateTotalMaxPenalty(classNames, constraints);
    scoreBreakdown.maxViolations = -maxPenalty;
    totalScore -= maxPenalty;

    // Mutual-Wish-Soft-Penalty: pro getrenntem Pflichtpaar wird abgezogen, sodass der Optimizer
    // sie aktiv zusammenführt.
    const mutualPenalty = calculateMutualWishPenalty(classNames, constraints);
    scoreBreakdown.mutualViolations = -mutualPenalty;
    totalScore -= mutualPenalty;

    window.lastScoreBreakdown = scoreBreakdown;

    return totalScore;
}

function calculateClassMaxPenalty(studentsInClass, constraints) {
    // Max-Constraint-Verletzungen einer einzelnen Klasse als Soft-Penalty.
    // Gewichte sind hoch genug, dass eine Verletzung deutlich teurer ist als ein
    // einzelner Wunschwert (10) — aber niedriger als Min-Verletzungen (1000), damit
    // beide Reparaturarten koexistieren können.
    const PENALTY_PER_EXCESS = 200;
    const PENALTY_PER_EXCLUSION_PAIR = 400;
    let penalty = 0;

    const genderCounts = {};
    const oldClassCounts = {};
    let activeCount = 0;
    let grade1Count = 0;
    let grade3Count = 0;

    for (const student of studentsInClass) {
        const gender = normalizeGender(student);
        const oldClass = normalizeOldClass(student);
        const activity = normalizeActivity(student);
        const grade = normalizeGrade(student);
        genderCounts[gender] = (genderCounts[gender] || 0) + 1;
        oldClassCounts[oldClass] = (oldClassCounts[oldClass] || 0) + 1;
        if (activity === 'a') activeCount++;
        if (grade === '1') grade1Count++;
        if (grade === '3') grade3Count++;
    }

    if (constraints.maxSameGender > 0) {
        for (const g in genderCounts) {
            if (genderCounts[g] > constraints.maxSameGender) {
                penalty += (genderCounts[g] - constraints.maxSameGender) * PENALTY_PER_EXCESS;
            }
        }
    }
    if (constraints.maxSameOldClass > 0) {
        for (const c in oldClassCounts) {
            if (oldClassCounts[c] > constraints.maxSameOldClass) {
                penalty += (oldClassCounts[c] - constraints.maxSameOldClass) * PENALTY_PER_EXCESS;
            }
        }
    }
    if (constraints.maxClassSize > 0 && studentsInClass.length > constraints.maxClassSize) {
        penalty += (studentsInClass.length - constraints.maxClassSize) * PENALTY_PER_EXCESS;
    }
    if (constraints.maxActive > 0 && activeCount > constraints.maxActive) {
        penalty += (activeCount - constraints.maxActive) * PENALTY_PER_EXCESS;
    }
    if (constraints.maxGrade1 > 0 && grade1Count > constraints.maxGrade1) {
        penalty += (grade1Count - constraints.maxGrade1) * PENALTY_PER_EXCESS;
    }
    if (constraints.maxGrade3 > 0 && grade3Count > constraints.maxGrade3) {
        penalty += (grade3Count - constraints.maxGrade3) * PENALTY_PER_EXCESS;
    }

    let exclusionPairs = 0;
    for (let i = 0; i < studentsInClass.length; i++) {
        for (let j = i + 1; j < studentsInClass.length; j++) {
            if (isExcluded(studentsInClass[i], studentsInClass[j]) ||
                isExcluded(studentsInClass[j], studentsInClass[i])) {
                exclusionPairs++;
            }
        }
    }
    penalty += exclusionPairs * PENALTY_PER_EXCLUSION_PAIR;

    return penalty;
}

function calculateTotalMaxPenalty(classNames, constraints) {
    let total = 0;
    for (const className of classNames) {
        total += calculateClassMaxPenalty(currentClasses[className], constraints);
    }
    return total;
}

function calculateMutualWishPenalty(classNames, constraints) {
    if (!constraints.mutualWishOneRequired) return 0;
    const PENALTY_PER_SPLIT_PAIR = 1500;

    const studentToClass = {};
    for (const className of classNames) {
        for (const student of currentClasses[className]) {
            studentToClass[student['Schüler']] = className;
        }
    }

    let penalty = 0;
    for (const wishesRecord of wishesData) {
        const student1 = wishesRecord['Schüler'];
        const student2 = wishesRecord['Wunsch 1 - Höchste Priorität'];
        if (!student1 || !student2) continue;
        if (student1 > student2) continue;          // jedes Paar genau einmal
        if (!isMutualWishPair(student1, student2)) continue;

        const class1 = studentToClass[student1];
        const class2 = studentToClass[student2];
        if (!class1 || !class2) continue;
        if (isExcludedByName(student1, student2)) continue;

        if (class1 !== class2) penalty += PENALTY_PER_SPLIT_PAIR;
    }

    return penalty;
}

function calculateMinConstraintPenalty(classNames, constraints) {
    let penalty = 0;
    const PENALTY_PER_MISSING_STUDENT = 1000;

    for (const className of classNames) {
        const studentsInClass = currentClasses[className];
        const oldClassCounts = {};
        const distinctOldClasses = new Set();
        for (const student of studentsInClass) {
            const oldClass = normalizeOldClass(student);
            oldClassCounts[oldClass] = (oldClassCounts[oldClass] || 0) + 1;
            distinctOldClasses.add(oldClass);
        }

        if (constraints.minSameOldClass > 1) {
            for (const oldClass in oldClassCounts) {
                const count = oldClassCounts[oldClass];
                if (count > 0 && count < constraints.minSameOldClass) {
                    penalty += (constraints.minSameOldClass - count) * PENALTY_PER_MISSING_STUDENT;
                }
            }
        }

        if (constraints.minClassSize > 0 && studentsInClass.length < constraints.minClassSize) {
            penalty += (constraints.minClassSize - studentsInClass.length) * PENALTY_PER_MISSING_STUDENT;
        }

        if (constraints.minDistinctOldClasses > 0 && distinctOldClasses.size < constraints.minDistinctOldClasses) {
            penalty += (constraints.minDistinctOldClasses - distinctOldClasses.size) * PENALTY_PER_MISSING_STUDENT;
        }
    }

    return penalty;
}

function calculateDistributions(classNames) {
    const distributions = {
        gender: { variance: 0, details: {} },
        activity: { variance: 0, details: {} },
        grades: { variance: 0, details: {} },
        oldClass: { variance: 0, details: {} },
        sizeVariance: 0
    };
    
    const classStats = {};
    for (const className of classNames) {
        classStats[className] = {
            total: currentClasses[className].length,
            gender: { m: 0, w: 0, d: 0 },
            activity: { s: 0, a: 0 },
            grades: {},
            oldClass: {}
        };
        
        for (const student of currentClasses[className]) {
            const gender = student['Geschlecht (m/w/d)'] || 'unbekannt';
            if (gender in classStats[className].gender) {
                classStats[className].gender[gender]++;
            }
            
            const activity = getStudentActivityType(student);
            if (activity in classStats[className].activity) {
                classStats[className].activity[activity]++;
            }
            
            const grade = student['Notenbild'] || 'Unbekannt';
            classStats[className].grades[grade] = (classStats[className].grades[grade] || 0) + 1;
            
            const oldClass = student['Alte Klasse'] || 'Unbekannt';
            classStats[className].oldClass[oldClass] = (classStats[className].oldClass[oldClass] || 0) + 1;
        }
    }
    
    // Calculate variances
    const classSizes = classNames.map(cn => classStats[cn].total);
    const avgSize = classSizes.reduce((a, b) => a + b, 0) / classSizes.length;
    distributions.sizeVariance = classSizes.reduce((acc, size) => 
        acc + Math.pow((size - avgSize) / avgSize, 2), 0) / classSizes.length;
    
    // Gender variance
    const genderRatios = classNames.map(cn => {
        const total = classStats[cn].total || 1;
        return {
            m: classStats[cn].gender.m / total,
            w: classStats[cn].gender.w / total,
            d: classStats[cn].gender.d / total
        };
    });
    
    const avgGender = {
        m: genderRatios.reduce((acc, r) => acc + r.m, 0) / genderRatios.length,
        w: genderRatios.reduce((acc, r) => acc + r.w, 0) / genderRatios.length,
        d: genderRatios.reduce((acc, r) => acc + r.d, 0) / genderRatios.length
    };
    
    distributions.gender.variance = genderRatios.reduce((acc, r) => 
        acc + Math.pow(r.m - avgGender.m, 2) + 
        Math.pow(r.w - avgGender.w, 2) + 
        Math.pow(r.d - avgGender.d, 2), 0) / (genderRatios.length * 3);
    
    // Activity variance
    const activityRatios = classNames.map(cn => {
        const total = classStats[cn].total || 1;
        return {
            s: classStats[cn].activity.s / total,
            a: classStats[cn].activity.a / total
        };
    });
    
    const avgActivity = {
        s: activityRatios.reduce((acc, r) => acc + r.s, 0) / activityRatios.length,
        a: activityRatios.reduce((acc, r) => acc + r.a, 0) / activityRatios.length
    };
    
    distributions.activity.variance = activityRatios.reduce((acc, r) => 
        acc + Math.pow(r.s - avgActivity.s, 2) + 
        Math.pow(r.a - avgActivity.a, 2), 0) / (activityRatios.length * 2);
    
    distributions.grades.variance = 0.1;
    distributions.oldClass.variance = 0.1;
    distributions.details = classStats;
    
    return distributions;
}

// Display functions
function displayClasses() {
    const container = document.getElementById('classesContainer');
    container.innerHTML = '';
    
    // Find mutual pairs if checkbox is checked
    if (document.getElementById('showMutualPairs').checked) {
        findMutualPairs();
    } else {
        mutualPairs = [];
        pairSymbols = {};
    }
    
    const classCount = Object.keys(currentClasses).length;
    if (classCount > 4) {
        container.classList.add('many-classes');
    } else {
        container.classList.remove('many-classes');
    }
    
    for (const className in currentClasses) {
        const classBox = createClassBox(className, currentClasses[className]);
        container.appendChild(classBox);
    }
    
    markUnfulfilledWishes();
    updateStats();
    document.getElementById('statsSection').style.display = 'flex';
}

function createClassBox(className, students) {
    const box = document.createElement('div');
    box.className = 'class-box';
    box.dataset.className = className;

    const constraintFlags = getClassConstraintFlags(students, className);
    if (constraintFlags.hasViolation) {
        box.classList.add('has-constraint-violation');
    }
    
    const header = document.createElement('div');
    header.className = 'class-header';
    if (className === 'Ignorierte Schüler') {
        header.className += ' ignored';
    }
    header.textContent = `${className} (${students.length} Schüler)`;
    box.appendChild(header);
    
    const stats = createClassStats(students, constraintFlags);
    box.appendChild(stats);
    
    const studentsList = document.createElement('div');
    studentsList.className = 'students-list';
    
    students.forEach(student => {
        const studentDiv = createStudentElement(student);
        studentsList.appendChild(studentDiv);
    });
    
    box.appendChild(studentsList);
    
    box.addEventListener('dragover', handleDragOver);
    box.addEventListener('drop', handleDrop);
    box.addEventListener('dragleave', handleDragLeave);
    
    return box;
}

function createClassStats(students, constraintFlags = getClassConstraintFlags(students)) {
    const stats = document.createElement('div');
    stats.className = 'class-stats';
    
    const genderCounts = { m: 0, w: 0, d: 0 };
    const typeCounts = { s: 0, a: 0 };
    const gradeCounts = {};
    const oldClassCounts = {};
    
    students.forEach(s => {
        const gender = s['Geschlecht (m/w/d)'];
        if (gender in genderCounts) genderCounts[gender]++;
        
        const type = getStudentActivityType(s);
        if (type in typeCounts) typeCounts[type]++;
        
        const grade = normalizeGrade(s) || 'Unbekannt';
        gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
        
        const oldClass = s['Alte Klasse'];
        oldClassCounts[oldClass] = (oldClassCounts[oldClass] || 0) + 1;
    });
    
    stats.innerHTML = `
        <div class="stat-row ${constraintFlags.gender ? 'constraint-violation' : ''}">
            <span class="stat-label">Geschlecht:</span>
            <span>m: ${genderCounts.m}, w: ${genderCounts.w}, d: ${genderCounts.d}</span>
        </div>
        <div class="stat-row ${constraintFlags.activity ? 'constraint-violation' : ''}">
            <span class="stat-label">Typ:</span>
            <span>still: ${typeCounts.s}, aktiv: ${typeCounts.a}</span>
        </div>
        <div class="stat-row ${constraintFlags.grades ? 'constraint-violation' : ''}">
            <span class="stat-label">Noten:</span>
            <span>${Object.entries(gradeCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}</span>
        </div>
        <div class="stat-row ${constraintFlags.oldClass ? 'constraint-violation' : ''}">
            <span class="stat-label">Alte Klassen:</span>
            <span>${Object.entries(oldClassCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}</span>
        </div>
        ${constraintFlags.classSize ? '<div class="stat-row constraint-violation"><span class="stat-label">Klassengröße:</span><span>Min/Max verletzt</span></div>' : ''}
        ${constraintFlags.oldClassDiversity ? '<div class="stat-row constraint-violation"><span class="stat-label">Vielfalt alte Klassen:</span><span>Mindestanzahl unterschritten</span></div>' : ''}
        ${constraintFlags.exclusion ? '<div class="stat-row constraint-violation"><span class="stat-label">Ausschlüsse:</span><span>Konflikt in dieser Klasse</span></div>' : ''}
    `;
    
    return stats;
}

function getClassConstraintFlags(studentsInClass, className = '') {
    if (className === 'Ignorierte Schüler') {
        return {
            gender: false,
            activity: false,
            grades: false,
            classSize: false,
            oldClass: false,
            oldClassDiversity: false,
            exclusion: false,
            hasViolation: false
        };
    }

    const constraints = getConstraintConfig();
    const flags = {
        gender: false,
        activity: false,
        grades: false,
        classSize: false,
        oldClass: false,
        oldClassDiversity: false,
        exclusion: false,
        hasViolation: false
    };

    const genderCounts = {};
    const oldClassCounts = {};
    let activeCount = 0;
    let grade1Count = 0;
    let grade3Count = 0;
    const distinctOldClasses = new Set();

    for (const student of studentsInClass) {
        const gender = normalizeGender(student);
        const oldClass = normalizeOldClass(student);
        const activity = normalizeActivity(student);
        const grade = normalizeGrade(student);

        genderCounts[gender] = (genderCounts[gender] || 0) + 1;
        oldClassCounts[oldClass] = (oldClassCounts[oldClass] || 0) + 1;
        distinctOldClasses.add(oldClass);

        if (activity === 'a') activeCount++;
        if (grade === '1') grade1Count++;
        if (grade === '3') grade3Count++;
    }

    if (constraints.maxSameGender > 0) {
        for (const gender in genderCounts) {
            if (genderCounts[gender] > constraints.maxSameGender) {
                flags.gender = true;
                break;
            }
        }
    }

    for (const oldClass in oldClassCounts) {
        if (constraints.maxSameOldClass > 0 && oldClassCounts[oldClass] > constraints.maxSameOldClass) {
            flags.oldClass = true;
        }
        if (constraints.minSameOldClass > 1 && oldClassCounts[oldClass] > 0 && oldClassCounts[oldClass] < constraints.minSameOldClass) {
            flags.oldClass = true;
        }
    }

    if (constraints.maxActive > 0 && activeCount > constraints.maxActive) {
        flags.activity = true;
    }

    if ((constraints.maxGrade1 > 0 && grade1Count > constraints.maxGrade1) ||
        (constraints.maxGrade3 > 0 && grade3Count > constraints.maxGrade3)) {
        flags.grades = true;
    }

    if ((constraints.maxClassSize > 0 && studentsInClass.length > constraints.maxClassSize) ||
        (constraints.minClassSize > 0 && studentsInClass.length < constraints.minClassSize)) {
        flags.classSize = true;
    }

    if (constraints.minDistinctOldClasses > 0 && distinctOldClasses.size < constraints.minDistinctOldClasses) {
        flags.oldClassDiversity = true;
    }

    flags.exclusion = classHasExclusionConflict(studentsInClass);
    flags.hasViolation = flags.gender || flags.activity || flags.grades || flags.classSize || flags.oldClass || flags.oldClassDiversity || flags.exclusion;

    return flags;
}

function findStudentClassName(studentName) {
    for (const className in currentClasses) {
        if (currentClasses[className].some(s => s['Schüler'] === studentName)) {
            return className;
        }
    }
    return null;
}

function isSeparatedMutualWishOneStudent(studentName) {
    const studentClass = findStudentClassName(studentName);
    if (!studentClass) return false;

    return mutualPairs.some(([student1Name, student2Name]) => {
        if (student1Name !== studentName && student2Name !== studentName) {
            return false;
        }

        const partnerName = student1Name === studentName ? student2Name : student1Name;
        const partnerClass = findStudentClassName(partnerName);
        return partnerClass && partnerClass !== studentClass;
    });
}

function getStudentTooltipText(student) {
    const oldClass = (student['Alte Klasse'] || 'Unbekannt').toString().trim() || 'Unbekannt';
    const grade = normalizeGrade(student) || 'Unbekannt';

    const genderMap = {
        m: 'm',
        w: 'w',
        d: 'd'
    };
    const activityMap = {
        s: 'still',
        a: 'aktiv'
    };

    const gender = genderMap[normalizeGender(student)] || 'unbekannt';
    const activity = activityMap[normalizeActivity(student)] || 'unbekannt';

    return [
        `Name: ${student['Schüler'] || 'Unbekannt'}`,
        `Alte Klasse: ${oldClass}`,
        `Geschlecht: ${gender}`,
        `Typ: ${activity}`,
        `Notenbild: ${grade}`
    ].join('\n');
}

function clearSelectionHighlights() {
    document.querySelectorAll('.student').forEach(el => {
        el.classList.remove('selected', 'wish-high', 'wish-medium', 'wish-low',
                           'wished-by-high', 'wished-by-medium', 'wished-by-low',
                           'excluded', 'mutual-pair');
    });
}

function createStudentElement(student) {
    const div = document.createElement('div');
    div.className = 'student';
    div.draggable = true;
    div.dataset.studentId = student['Schüler'];
    div.title = getStudentTooltipText(student);

    if (document.getElementById('showMutualPairs').checked && isSeparatedMutualWishOneStudent(student['Schüler'])) {
        div.classList.add('mutual-pair-separated');
    }

    if (manualExclusionHighlightStudentIds.has(student['Schüler'])) {
        div.classList.add('manual-exclusion-highlight');
    }
    
    // Check if we need to show fulfilled priority
    if (document.getElementById('showFulfilledPriority').checked) {
        const priorityStatus = getFulfilledPriority(student);
        if (priorityStatus) {
            div.classList.add('has-priority');
            const prioritySpan = document.createElement('span');
            prioritySpan.className = `student-priority-number ${priorityStatus.className}`;
            prioritySpan.textContent = priorityStatus.label;
            div.appendChild(prioritySpan);
        }
    }
    
    // Create text span for student name
    const nameSpan = document.createElement('span');
    nameSpan.textContent = student['Schüler'];
    nameSpan.style.flex = '1';
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    nameSpan.style.whiteSpace = 'nowrap';
    
    div.appendChild(nameSpan);
    
    // Add pair symbol if mutual pairs are shown and student is in a pair
    if (document.getElementById('showMutualPairs').checked && pairSymbols[student['Schüler']]) {
        div.classList.add('has-symbol');
        const symbolSpan = document.createElement('span');
        symbolSpan.className = 'student-pair-symbol';
        symbolSpan.textContent = pairSymbols[student['Schüler']];
        div.appendChild(symbolSpan);
    }
    
    div.addEventListener('click', () => selectStudent(student));
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragend', handleDragEnd);
    
    return div;
}

// Helper function to get the highest priority wish that was fulfilled
function getFulfilledPriority(student) {
    const wishes = wishesData.find(w => w['Schüler'] === student['Schüler']);
    if (!wishes) {
        return { label: '0', className: 'priority-none' };
    }

    const hasAnyWish = Boolean(
        wishes['Wunsch 1 - Höchste Priorität'] ||
        wishes['Wunsch 2 - Zweithöchste Priorität'] ||
        wishes['Wunsch 3 - Dritthöchste Priorität']
    );

    if (!hasAnyWish) {
        return { label: '0', className: 'priority-none' };
    }
    
    // Find student's class
    let studentClass = null;
    for (const className in currentClasses) {
        if (currentClasses[className].some(s => s['Schüler'] === student['Schüler'])) {
            studentClass = className;
            break;
        }
    }
    
    if (!studentClass) return null;
    
    const classmates = currentClasses[studentClass].map(s => s['Schüler']);
    
    // Check wishes in order of priority
    if (classmates.includes(wishes['Wunsch 1 - Höchste Priorität'])) {
        return { label: '1', className: 'priority-1' };
    }
    if (classmates.includes(wishes['Wunsch 2 - Zweithöchste Priorität'])) {
        return { label: '2', className: 'priority-2' };
    }
    if (classmates.includes(wishes['Wunsch 3 - Dritthöchste Priorität'])) {
        return { label: '3', className: 'priority-3' };
    }
    
    return { label: 'X', className: 'priority-unfulfilled' };
}

function markUnfulfilledWishes() {
}

function updateStats() {
    const totalScore = calculateTotalScore();
    const details = calculateScoreDetails();
    
    document.getElementById('totalScore').textContent = totalScore;
    document.getElementById('scoreDetails').innerHTML = details;
}

function calculateScoreDetails() {
    let totalStudents = 0;
    let ignoredStudents = 0;
    let studentsWithWishes = 0;
    let studentsWithFulfilledWishes = 0;
    let totalWishesFulfilled = 0;
    let wishBreakdown = { 1: 0, 2: 0, 3: 0 };
    
    studentData.forEach(student => {
        totalStudents++;
        
        if (student['Ignorieren'] === 'j' && !document.getElementById('includeIgnored').checked) {
            ignoredStudents++;
            return;
        }
        
        const wishes = wishesData.find(w => w['Schüler'] === student['Schüler']);
        if (!wishes) return;
        
        const hasWishes = wishes['Wunsch 1 - Höchste Priorität'] || 
                         wishes['Wunsch 2 - Zweithöchste Priorität'] || 
                         wishes['Wunsch 3 - Dritthöchste Priorität'];
        
        if (!hasWishes) return;
        
        studentsWithWishes++;
        
        let studentClass = null;
        for (const className in currentClasses) {
            if (currentClasses[className].some(s => s['Schüler'] === student['Schüler'])) {
                studentClass = className;
                break;
            }
        }
        
        if (!studentClass || studentClass === 'Ignorierte Schüler') return;
        
        const classmates = currentClasses[studentClass].map(s => s['Schüler']);
        
        // Count only the highest fulfilled wish priority
        let highestFulfilledPriority = 0;
        if (classmates.includes(wishes['Wunsch 1 - Höchste Priorität'])) {
            highestFulfilledPriority = 1;
        } else if (classmates.includes(wishes['Wunsch 2 - Zweithöchste Priorität'])) {
            highestFulfilledPriority = 2;
        } else if (classmates.includes(wishes['Wunsch 3 - Dritthöchste Priorität'])) {
            highestFulfilledPriority = 3;
        }
        
        if (highestFulfilledPriority > 0) {
            wishBreakdown[highestFulfilledPriority]++;
            totalWishesFulfilled++;
            studentsWithFulfilledWishes++;
        }
    });
    
    const fulfillmentRate = studentsWithWishes > 0 
        ? Math.round((studentsWithFulfilledWishes / studentsWithWishes) * 100) 
        : 0;
    
    const scoreBreakdown = window.lastScoreBreakdown || {
        wishes: 0, gender: 0, activity: 0, grades: 0, oldClass: 0, balance: 0
    };
    
    let html = `
        <strong>Schülerübersicht:</strong> ${totalStudents} Schüler gesamt`;
    
    if (ignoredStudents > 0) {
        html += ` (${ignoredStudents} ignoriert)`;
    }
    
    html += `<br>
        <strong>Wunscherfüllung:</strong> ${studentsWithFulfilledWishes} von ${studentsWithWishes} Schülern (${fulfillmentRate}%)<br>
        (Gezählt wird pro Schüler nur die höchste erfüllte Priorität)<br>
        Erfüllte Wünsche: ${wishBreakdown[1]}x Priorität 1, ${wishBreakdown[2]}x Priorität 2, ${wishBreakdown[3]}x Priorität 3<br>`;
    
    // Add mutual pairs information if checkbox is checked
    if (document.getElementById('showMutualPairs').checked && mutualPairs.length > 0) {
        html += `<strong>Gegenseitige Wünsche:</strong> ${mutualPairs.length} Paare gefunden<br>`;
    }
    
    html += `<br>
        <strong>Score-Zusammensetzung:</strong><br>
        <div style="margin-left: 20px; font-size: 0.85em;">
            Wünsche: ${scoreBreakdown.wishes} Punkte<br>
            Geschlechterverteilung: ${scoreBreakdown.gender}/50 Punkte<br>
            Aktivitätsverteilung: ${scoreBreakdown.activity}/40 Punkte<br>
            Notenverteilung: ${scoreBreakdown.grades}/30 Punkte<br>
            Alte Klassen: ${scoreBreakdown.oldClass}/40 Punkte<br>
            Klassengrößen: ${scoreBreakdown.balance}/30 Punkte
        </div>
    `;
    
    return html;
}

// Selection and interaction functions
function selectStudent(student) {
    const isSameSelectedStudent = selectedStudent && selectedStudent['Schüler'] === student['Schüler'];

    clearSelectionHighlights();

    if (isSameSelectedStudent) {
        selectedStudent = null;
        return;
    }

    const selectedStudentClass = findStudentClassName(student['Schüler']);
    
    const selectedEl = document.querySelector(`[data-student-id="${student['Schüler']}"]`);
    if (selectedEl) {
        selectedEl.classList.add('selected');
    }
    
    const wishes = wishesData.find(w => w['Schüler'] === student['Schüler']);
    if (wishes) {
        const wish1 = document.querySelector(`[data-student-id="${wishes['Wunsch 1 - Höchste Priorität']}"]`);
        const wish2 = document.querySelector(`[data-student-id="${wishes['Wunsch 2 - Zweithöchste Priorität']}"]`);
        const wish3 = document.querySelector(`[data-student-id="${wishes['Wunsch 3 - Dritthöchste Priorität']}"]`);
        
        if (wish1) wish1.classList.add('wish-high');
        if (wish2) wish2.classList.add('wish-medium');
        if (wish3) wish3.classList.add('wish-low');
        
        // Check if wish1 is a mutual pair
        if (document.getElementById('showMutualPairs').checked && wish1) {
            const wish1Student = wishes['Wunsch 1 - Höchste Priorität'];
            const partnerWishes = wishesData.find(w => w['Schüler'] === wish1Student);
            if (partnerWishes && partnerWishes['Wunsch 1 - Höchste Priorität'] === student['Schüler']) {
                const wish1StudentClass = findStudentClassName(wish1Student);
                const separatedMutualPair = selectedStudentClass && wish1StudentClass && selectedStudentClass !== wish1StudentClass;
                wish1.classList.add(separatedMutualPair ? 'mutual-pair-separated' : 'mutual-pair');
            }
        }
    }
    
    wishesData.forEach(wish => {
        let el = null;
        if (wish['Wunsch 1 - Höchste Priorität'] === student['Schüler']) {
            el = document.querySelector(`[data-student-id="${wish['Schüler']}"]`);
            if (el) {
                el.classList.add('wished-by-high');
                
                // Check if this is a mutual pair
                if (document.getElementById('showMutualPairs').checked && wishes && 
                    wishes['Wunsch 1 - Höchste Priorität'] === wish['Schüler']) {
                    const wishingStudentClass = findStudentClassName(wish['Schüler']);
                    const separatedMutualPair = selectedStudentClass && wishingStudentClass && selectedStudentClass !== wishingStudentClass;
                    el.classList.add(separatedMutualPair ? 'mutual-pair-separated' : 'mutual-pair');
                }
            }
        } else if (wish['Wunsch 2 - Zweithöchste Priorität'] === student['Schüler']) {
            el = document.querySelector(`[data-student-id="${wish['Schüler']}"]`);
            if (el) el.classList.add('wished-by-medium');
        } else if (wish['Wunsch 3 - Dritthöchste Priorität'] === student['Schüler']) {
            el = document.querySelector(`[data-student-id="${wish['Schüler']}"]`);
            if (el) el.classList.add('wished-by-low');
        }
    });
    
    studentData.forEach(otherStudent => {
        if (otherStudent['Schüler'] === student['Schüler']) return;
        
        if (isExcluded(student, otherStudent) || isExcluded(otherStudent, student)) {
            const el = document.querySelector(`[data-student-id="${otherStudent['Schüler']}"]`);
            if (el) el.classList.add('excluded');
        }
    });
    
    selectedStudent = student;
}

// Drag and drop handlers
function handleDragStart(e) {
    draggedStudent = studentData.find(s => s['Schüler'] === e.target.dataset.studentId);
    draggedFromClass = e.target.closest('.class-box').dataset.className;
    e.target.classList.add('dragging');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const targetClass = e.currentTarget.dataset.className;
    
    if (targetClass === draggedFromClass) return;

    clearManualExclusionPairsForStudent(draggedStudent['Schüler']);
    
    const movedStudentIds = new Set([draggedStudent['Schüler']]);

    currentClasses[draggedFromClass] = currentClasses[draggedFromClass].filter(
        s => !movedStudentIds.has(s['Schüler'])
    );
    
    currentClasses[targetClass].push(draggedStudent);

    addManualExclusionPairsForStudentInClass(draggedStudent, targetClass);
    
    displayClasses();

    const sourceFlags = getClassConstraintFlags(currentClasses[draggedFromClass], draggedFromClass);
    const targetFlags = getClassConstraintFlags(currentClasses[targetClass], targetClass);
    const hasWarnings = sourceFlags.hasViolation || targetFlags.hasViolation;
    
    if (selectedStudent && selectedStudent['Schüler'] === draggedStudent['Schüler']) {
        setTimeout(() => selectStudent(draggedStudent), 100);
    }

    if (hasWarnings) {
        showError(`Hinweis: ${draggedStudent['Schüler']} wurde verschoben. In mindestens einer betroffenen Klasse sind Grenzen verletzt (rot markiert).`);
    } else {
        showSuccess(`${draggedStudent['Schüler']} wurde in ${targetClass} verschoben!`);
    }
}

// Import/Export functions
function exportClasses() {
    if (Object.keys(currentClasses).length === 0) {
        showError('Keine Klasseneinteilung zum Exportieren vorhanden!');
        return;
    }
    
    const exportData = {
        version: '1.4',
        exportDate: new Date().toISOString(),
        totalScore: calculateTotalScore(),
        classCount: Object.keys(currentClasses).filter(c => c !== 'Ignorierte Schüler').length,
        includeIgnored: document.getElementById('includeIgnored').checked,
        showMutualPairs: document.getElementById('showMutualPairs').checked,
        showFulfilledPriority: document.getElementById('showFulfilledPriority').checked,
        distributionRules: {
            maxSameGender: parseInt(document.getElementById('maxSameGender').value) || 0,
            maxSameOldClass: parseInt(document.getElementById('maxSameOldClass').value) || 0,
            minSameOldClass: parseInt(document.getElementById('minSameOldClass').value) || 0,
            maxClassSize: parseInt(document.getElementById('maxClassSize').value) || 0,
            minClassSize: parseInt(document.getElementById('minClassSize').value) || 0,
            maxActive: parseInt(document.getElementById('maxActive').value) || 0,
            maxGrade1: parseInt(document.getElementById('maxGrade1').value) || 0,
            maxGrade3: parseInt(document.getElementById('maxGrade3').value) || 0,
            minDistinctOldClasses: parseInt(document.getElementById('minDistinctOldClasses').value) || 0,
            mutualWishOneRequired: document.getElementById('mutualWishOneRequired').checked
        },
        classes: {},
        metadata: {
            totalStudents: studentData.length,
            ignoredStudents: studentData.filter(s => s['Ignorieren'] === 'j').length,
            mutualPairsCount: mutualPairs.length
        }
    };
    
    for (const className in currentClasses) {
        exportData.classes[className] = currentClasses[className].map(s => s['Schüler']);
    }
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `klasseneinteilung_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showSuccess('Klasseneinteilung erfolgreich exportiert!');
}

function importClasses(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (wishesData.length === 0 || studentData.length === 0) {
        showError('Bitte laden Sie zuerst die Wünsche- und Schülerdaten-Dateien!');
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            if (!importData.version || !importData.classes) {
                throw new Error('Ungültiges Dateiformat');
            }
            
            if (importData.classCount) {
                document.getElementById('classCount').value = importData.classCount;
            }
            if (importData.includeIgnored !== undefined) {
                document.getElementById('includeIgnored').checked = importData.includeIgnored;
            }
            if (importData.showMutualPairs !== undefined) {
                document.getElementById('showMutualPairs').checked = importData.showMutualPairs;
            }
            if (importData.showFulfilledPriority !== undefined) {
                document.getElementById('showFulfilledPriority').checked = importData.showFulfilledPriority;
            }
            
            // Import distribution rules
            if (importData.distributionRules) {
                if (importData.distributionRules.maxSameGender !== undefined) {
                    document.getElementById('maxSameGender').value = importData.distributionRules.maxSameGender;
                }
                if (importData.distributionRules.maxSameOldClass !== undefined) {
                    document.getElementById('maxSameOldClass').value = importData.distributionRules.maxSameOldClass;
                }
                if (importData.distributionRules.minSameOldClass !== undefined) {
                    document.getElementById('minSameOldClass').value = importData.distributionRules.minSameOldClass;
                }
                if (importData.distributionRules.maxClassSize !== undefined) {
                    document.getElementById('maxClassSize').value = importData.distributionRules.maxClassSize;
                }
                if (importData.distributionRules.minClassSize !== undefined) {
                    document.getElementById('minClassSize').value = importData.distributionRules.minClassSize;
                }
                if (importData.distributionRules.maxActive !== undefined) {
                    document.getElementById('maxActive').value = importData.distributionRules.maxActive;
                }
                if (importData.distributionRules.maxGrade1 !== undefined) {
                    document.getElementById('maxGrade1').value = importData.distributionRules.maxGrade1;
                }
                if (importData.distributionRules.maxGrade3 !== undefined) {
                    document.getElementById('maxGrade3').value = importData.distributionRules.maxGrade3;
                }
                if (importData.distributionRules.minDistinctOldClasses !== undefined) {
                    document.getElementById('minDistinctOldClasses').value = importData.distributionRules.minDistinctOldClasses;
                }
                if (importData.distributionRules.mutualWishOneRequired !== undefined) {
                    document.getElementById('mutualWishOneRequired').checked = importData.distributionRules.mutualWishOneRequired;
                }
            }
            
            currentClasses = {};
            manualExclusionHighlightStudentIds.clear();
            manualExclusionHighlightPairs.clear();
            
            for (const className in importData.classes) {
                currentClasses[className] = [];
                
                for (const studentName of importData.classes[className]) {
                    const student = studentData.find(s => s['Schüler'] === studentName);
                    if (student) {
                        currentClasses[className].push(student);
                    }
                }
            }
            
            displayClasses();
            
            showSuccess(`Klasseneinteilung erfolgreich importiert! (Score: ${importData.totalScore})`);
            
        } catch (error) {
            showError('Fehler beim Importieren: ' + error.message);
        }
        
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

function resetAll() {
    wishesData = [];
    studentData = [];
    currentClasses = {};
    selectedStudent = null;
    mutualPairs = [];
    pairSymbols = {};
    manualExclusionHighlightStudentIds.clear();
    manualExclusionHighlightPairs.clear();
    
    document.getElementById('wishesFile').value = '';
    document.getElementById('studentDataFile').value = '';
    document.getElementById('generateBtn').disabled = true;
    document.getElementById('classesContainer').innerHTML = '';
    document.getElementById('statsSection').style.display = 'none';
    document.getElementById('showMutualPairs').checked = false;
    document.getElementById('showFulfilledPriority').checked = false;
    document.getElementById('classCount').value = 4;
    document.getElementById('includeIgnored').checked = false;
    document.getElementById('maxSameGender').value = 0;
    document.getElementById('maxSameOldClass').value = 0;
    document.getElementById('minSameOldClass').value = 2;
    document.getElementById('maxClassSize').value = 0;
    document.getElementById('minClassSize').value = 0;
    document.getElementById('maxActive').value = 0;
    document.getElementById('maxGrade1').value = 0;
    document.getElementById('maxGrade3').value = 0;
    document.getElementById('minDistinctOldClasses').value = 0;
    document.getElementById('mutualWishOneRequired').checked = false;
    
    showSuccess('Alle Daten zurückgesetzt!');
}