function analyzeExcel() {
    const fileInput = document.getElementById('excel-file');
    const files = fileInput.files;
    
    if (files.length === 0) {
        alert('Bitte mindestens eine .xlsx-Datei auswählen.');
        return;
    }
    
    let combinedCsvContent = 'Klasse; Schüler_in; Fach; Fachlehrkraft; Note; Angebot\n'; // Header for combined CSV file
    
    let alleKlassen = "";

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
    
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // let resultHtml = '<h2>Förderbedarf</h2>';
        let csvContent = '';    //Spaltenbezeichnungen der exportierten Tabelle

        let pupilIndex = null;
        let subjectIndexes = [];

        let foerderbedarfHauptfach = ["4-","5+","5-","6+"];
        let foerderbedarfNebenfach = ["5+","5-","6+"];
        let hauptfaecher = ["D","Ma","E"];

        /*
        // Find the row containing pupil names
        for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
            const row = jsonData[rowIndex];
            const pupilCell = row.find(cell => typeof cell === 'string' && cell.toLowerCase().includes('pupil'));
            if (pupilCell) {
                pupilIndex = rowIndex;
                break;
            }
        }
        */

        // Zeile ab der die Schüler beginnen händisch setzen
        pupilIndex = 6;
        // fachZeile händisch setzen
        let fachZeile = jsonData[4];
        // lehrerZeile händisch setzen
        let lehrerZeile = jsonData[6];
        // klassenfelg händisch setzen und auslesen
        let klasse = jsonData[1][2].substring(8); //"Klasse: " überspringen

        alleKlassen += `_${klasse}`;

        // angebotsZeile dynamisch auf Grundlage des Schlagworts 'Angebot' bestimmen
        for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
            const row = jsonData[rowIndex];
            if (row.includes('Angebot')) {
                subjectIndexes = row.map((cell, index) => cell === 'Angebot' ? null : index).filter(index => index !== null);
                break;
            }
        }

        // Start analyzing from pupilIndex + 1 to skip header rows
        for (let rowIndex = pupilIndex + 1; rowIndex < jsonData.length; rowIndex++) {
            const row = jsonData[rowIndex];
            if (!row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('total'))) { // Skip rows containing 'Total'
                const pupilName = row[1];   //Leere Spalte überspringen
                const subjectsWithMarksBelowFour = [];
                const marks = [];
                const lehrerS = [];
                const fachKuerzelS = [];

                subjectIndexes.forEach(subjectIndex => {
                    const subjectName = jsonData[pupilIndex - 1][subjectIndex];
                    const mark = row[subjectIndex];
                    const lehrer = lehrerZeile[subjectIndex];
                    let fachKuerzel = fachZeile[subjectIndex];
                    let i = subjectIndex-1;
                    while (subjectName && !fachKuerzel && i>0){
                        fachKuerzel = fachZeile[i];
                        i--;
                    }
                    let foerderbedarf = [];
                    if (hauptfaecher.includes(fachKuerzel)) {
                        foerderbedarf = foerderbedarfHauptfach;
                    }
                    else {
                        foerderbedarf = foerderbedarfNebenfach;
                    }
                    if (mark && (foerderbedarf.includes(mark) || mark > 4)) {
                        subjectsWithMarksBelowFour.push(subjectName);
                        marks.push(mark);
                        lehrerS.push(lehrer);
                        fachKuerzelS.push(fachKuerzel);
                    }
                });

                if (subjectsWithMarksBelowFour.length > 0) {
                    let aktuelleSpalte = 0;
                    subjectsWithMarksBelowFour.forEach(subject => {
                        //resultHtml += `<p>${pupilName} Angebot: ${subject}, Note: ${marks[aktuelleSpalte]}, Lehrer: ${lehrerS[aktuelleSpalte]}, Fachkuerzel: ${fachKuerzelS[aktuelleSpalte]}</p>`;
                        csvContent += `"${klasse}";"${pupilName}";"${fachKuerzelS[aktuelleSpalte]}";"${lehrerS[aktuelleSpalte]}";"${marks[aktuelleSpalte]}";""\n`;
                        aktuelleSpalte++;
                    });

                }
            }
        }

        // Add CSV content for this file to combined CSV content
            combinedCsvContent += csvContent;
            
            // If this is the last file, download combined CSV file
            if (i === files.length - 1) {
                // Add UTF-8 Byte Order Mark (BOM)
                const utf8BOM = "\uFEFF";
                combinedCsvContent = utf8BOM + combinedCsvContent;

                // Split combined CSV content into rows and columns
                const rows = combinedCsvContent.trim().split('\n').map(row => row.split(';').map(cell => cell.replace(/^"|"$/g, '')));

                // Create a worksheet from the 2D array
                const worksheet = XLSX.utils.aoa_to_sheet(rows);

                // Create a new workbook and append the worksheet
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Förderbedarf");

                // Generate and download the XLSX file
                XLSX.writeFile(workbook, `Übersicht_Förderbedarf${alleKlassen}.xlsx`);

            }
        };
        
        reader.readAsArrayBuffer(file);
    }
}
