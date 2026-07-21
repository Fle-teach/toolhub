const analyzeBtn = document.getElementById("analyzeBtn");
const mergeBtn = document.getElementById("mergeBtn");
const downloadBtn = document.getElementById("downloadBtn");

const statusCard = document.getElementById("statusCard");
const countsCard = document.getElementById("countsCard");
const headerCard = document.getElementById("headerCard");
const diffCard = document.getElementById("diffCard");
const sortCard = document.getElementById("sortCard");
const resultCard = document.getElementById("resultCard");

const countsBody = document.getElementById("countsBody");
const headerList = document.getElementById("headerList");
const diffBody = document.getElementById("diffBody");
const sortOptions = document.getElementById("sortOptions");
const sortPriorityList = document.getElementById("sortPriorityList");
const resultMeta = document.getElementById("resultMeta");
const resultHead = document.getElementById("resultHead");
const resultBody = document.getElementById("resultBody");

let parsedTables = [];
let mergedRows = [];
let referenceHeader = [];
let selectedSortOrder = [];

// Gemeinsame Upload-Komponente aus toolhub.js
const upload = toolhubUpload({
	input: "fileInput",
	zone: "uploadBox",
	list: "fileList",
	extensions: [".xlsx", ".xls", ".xlsm"]
});

function resetOutput() {
	statusCard.className = "panel hidden";
	countsCard.classList.add("hidden");
	headerCard.classList.add("hidden");
	diffCard.classList.add("hidden");
	sortCard.classList.add("hidden");
	resultCard.classList.add("hidden");

	countsBody.innerHTML = "";
	headerList.innerHTML = "";
	diffBody.innerHTML = "";
	sortOptions.innerHTML = "";
	sortPriorityList.innerHTML = "";
	resultMeta.textContent = "";
	resultHead.innerHTML = "";
	resultBody.innerHTML = "";

	downloadBtn.disabled = true;
	mergedRows = [];
	parsedTables = [];
	referenceHeader = [];
	selectedSortOrder = [];
}

function showStatus(message, isWarning) {
	statusCard.className = "panel";
	toolhubMessage(statusCard, message, isWarning ? "error" : "success");
}

function safeCellValue(value) {
	if (value === null || value === undefined) return "";
	return String(value).trim();
}

function parseSheet(fileName, workbook) {
	const rows = toolhubSheetRows(workbook, { header: false, defval: "" });

	if (!rows.length) {
		return { fileName, header: [], rows: [] };
	}

	const header = rows[0].map(safeCellValue);
	const dataRows = rows
		.slice(1)
		.map((row) => {
			const rowObject = {};
			header.forEach((column, index) => {
				rowObject[column] = row[index] === undefined ? "" : row[index];
			});
			return rowObject;
		})
		.filter((rowObject) => Object.values(rowObject).some((value) => safeCellValue(value) !== ""));

	return { fileName, header, rows: dataRows };
}

function renderCounts(tables) {
	countsBody.innerHTML = "";
	tables.forEach((table) => {
		const tr = document.createElement("tr");
		tr.innerHTML = `<td>${toolhubEscapeHtml(table.fileName)}</td><td>${table.rows.length}</td>`;
		countsBody.appendChild(tr);
	});
	countsCard.classList.remove("hidden");
}

function getHeaderDifferences(baseHeader, tableHeader, fileName) {
	const differences = [];
	const maxLength = Math.max(baseHeader.length, tableHeader.length);
	for (let index = 0; index < maxLength; index += 1) {
		const expected = baseHeader[index] ?? "(nicht vorhanden)";
		const found = tableHeader[index] ?? "(nicht vorhanden)";
		if (expected !== found) {
			differences.push({
				fileName,
				column: index + 1,
				expected,
				found
			});
		}
	}
	return differences;
}

function renderHeader(header) {
	headerList.innerHTML = "";
	header.forEach((column) => {
		const span = document.createElement("span");
		span.className = "pill";
		span.textContent = column || "(leer)";
		headerList.appendChild(span);
	});
	headerCard.classList.remove("hidden");
}

function renderDiffs(differences) {
	diffBody.innerHTML = "";
	differences.forEach((diff) => {
		const tr = document.createElement("tr");
		tr.innerHTML = `
			<td>${toolhubEscapeHtml(diff.fileName)}</td>
			<td>${diff.column}</td>
			<td>${toolhubEscapeHtml(diff.expected)}</td>
			<td>${toolhubEscapeHtml(diff.found)}</td>
		`;
		diffBody.appendChild(tr);
	});
	diffCard.classList.remove("hidden");
}

function renderSortOptions(header) {
	sortOptions.innerHTML = "";
	selectedSortOrder = [];
	header.forEach((column, index) => {
		const wrapper = document.createElement("label");
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.value = index;
		const text = document.createElement("span");
		text.textContent = column || "(leer)";
		wrapper.append(checkbox, text);

		checkbox.addEventListener("change", (event) => {
			const columnIndex = Number(event.target.value);
			if (event.target.checked) {
				if (!selectedSortOrder.includes(columnIndex)) {
					selectedSortOrder.push(columnIndex);
				}
			} else {
				selectedSortOrder = selectedSortOrder.filter((indexValue) => indexValue !== columnIndex);
			}
			renderSortPriorityList();
		});
		sortOptions.appendChild(wrapper);
	});
	renderSortPriorityList();
	sortCard.classList.remove("hidden");
}

function renderSortPriorityList() {
	sortPriorityList.innerHTML = "";

	if (!selectedSortOrder.length) {
		const info = document.createElement("p");
		info.className = "muted";
		info.textContent = "Keine Sortierspalten gewählt – es wird ohne Sortierung zusammengeführt.";
		sortPriorityList.appendChild(info);
		return;
	}

	selectedSortOrder.forEach((columnIndex, position) => {
		const row = document.createElement("div");
		row.className = "priority-item";
		const columnName = referenceHeader[columnIndex] || "(leer)";

		const label = document.createElement("span");
		label.textContent = `${position + 1}. ${columnName}`;

		const actions = document.createElement("div");
		actions.className = "priority-actions";
		[["up", "Hoch"], ["down", "Runter"]].forEach(([action, beschriftung]) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "btn-secondary btn-small";
			button.dataset.action = action;
			button.dataset.pos = position;
			button.textContent = beschriftung;
			actions.appendChild(button);
		});

		row.append(label, actions);
		sortPriorityList.appendChild(row);
	});
}

sortPriorityList.addEventListener("click", (event) => {
	const button = event.target.closest("button[data-action]");
	if (!button) {
		return;
	}

	const position = Number(button.dataset.pos);
	const action = button.dataset.action;

	if (action === "up" && position > 0) {
		[selectedSortOrder[position - 1], selectedSortOrder[position]] = [selectedSortOrder[position], selectedSortOrder[position - 1]];
	}

	if (action === "down" && position < selectedSortOrder.length - 1) {
		[selectedSortOrder[position + 1], selectedSortOrder[position]] = [selectedSortOrder[position], selectedSortOrder[position + 1]];
	}

	renderSortPriorityList();
});

function getSelectedSortColumns() {
	return [...selectedSortOrder];
}

function compareValues(a, b) {
	const aNumber = Number(a);
	const bNumber = Number(b);
	const aIsNumber = !Number.isNaN(aNumber) && safeCellValue(a) !== "";
	const bIsNumber = !Number.isNaN(bNumber) && safeCellValue(b) !== "";

	if (aIsNumber && bIsNumber) {
		return aNumber - bNumber;
	}

	return String(a).localeCompare(String(b), "de", { sensitivity: "base", numeric: true });
}

function mergeAndSortTables(tables, sortColumns) {
	const rows = tables.flatMap((table) => table.rows);
	if (!sortColumns.length) {
		return rows;
	}

	return rows.sort((rowA, rowB) => {
		for (const columnIndex of sortColumns) {
			const columnName = referenceHeader[columnIndex];
			const result = compareValues(rowA[columnName], rowB[columnName]);
			if (result !== 0) {
				return result;
			}
		}
		return 0;
	});
}

function renderMergedTable(rows) {
	resultHead.innerHTML = "";
	resultBody.innerHTML = "";

	const trHead = document.createElement("tr");
	referenceHeader.forEach((column) => {
		const th = document.createElement("th");
		th.textContent = column || "(leer)";
		trHead.appendChild(th);
	});
	resultHead.appendChild(trHead);

	rows.forEach((row) => {
		const tr = document.createElement("tr");
		referenceHeader.forEach((column) => {
			const td = document.createElement("td");
			td.textContent = row[column] === undefined ? "" : String(row[column]);
			tr.appendChild(td);
		});
		resultBody.appendChild(tr);
	});

	resultMeta.textContent = `Gesamtzahl Datensätze: ${rows.length}`;
	resultCard.classList.remove("hidden");
}

async function readExcelFile(file) {
	return parseSheet(file.name, await toolhubReadWorkbook(file));
}

analyzeBtn.addEventListener("click", async () => {
	resetOutput();

	const files = [...upload.files];
	if (!files.length) {
		showStatus("Bitte mindestens eine Excel-Datei auswählen.", true);
		return;
	}

	try {
		parsedTables = await Promise.all(files.map(readExcelFile));
	} catch (error) {
		showStatus(`Dateien konnten nicht gelesen werden: ${error.message}`, true);
		return;
	}

	renderCounts(parsedTables);

	referenceHeader = parsedTables[0].header;
	const allDifferences = parsedTables.slice(1).flatMap((table) => getHeaderDifferences(referenceHeader, table.header, table.fileName));

	if (allDifferences.length) {
		showStatus("Kopfzeilen sind nicht identisch. Die Unterschiede sind unten aufgelistet.", true);
		renderDiffs(allDifferences);
		return;
	}

	showStatus("Kopfzeilen sind identisch.", false);
	renderHeader(referenceHeader);
	renderSortOptions(referenceHeader);
});

mergeBtn.addEventListener("click", () => {
	if (!parsedTables.length || !referenceHeader.length) {
		showStatus("Bitte zuerst Dateien prüfen.", true);
		return;
	}

	const sortColumns = getSelectedSortColumns();
	mergedRows = mergeAndSortTables(parsedTables, sortColumns);
	renderMergedTable(mergedRows);
	downloadBtn.disabled = false;
});

downloadBtn.addEventListener("click", () => {
	if (!mergedRows.length) {
		showStatus("Es sind keine Datensätze zum Herunterladen vorhanden.", true);
		return;
	}

	const exportData = [referenceHeader, ...mergedRows.map((row) => referenceHeader.map((column) => row[column] ?? ""))];
	toolhubWriteXlsx({ Zusammengefuehrt: exportData }, "foerderlisten-zusammengefuehrt.xlsx");
});
