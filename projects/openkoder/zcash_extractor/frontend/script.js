let cy;
let allLinks = [];
let activeDays = [];
let allNodes = [];

// Helper function to safely add or subtract days
function addDays(dateStr, days) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    const newDay = String(date.getDate()).padStart(2, '0');
    
    return `${newYear}-${newMonth}-${newDay}`;
}

// Helper function to get exact commits in a date range using cumulative data
function getCommitsInRange(cumulativeArray, dateFrom, dateTo) {
    if (!cumulativeArray || cumulativeArray.length === 0) return 0;
    
    let totalUpToTo = 0;
    let totalBeforeFrom = 0;
    
    for (let i = 0; i < cumulativeArray.length; i++) {
        const entry = cumulativeArray[i];
        if (entry.date <= dateTo) {
            totalUpToTo = entry.total;
        }
        if (entry.date < dateFrom) {
            totalBeforeFrom = entry.total;
        }
    }
    
    return Math.max(0, totalUpToTo - totalBeforeFrom);
}

// Unified function to adjust date with boundary checks
function adjustDate(inputElement, deltaDays) {
    if (!inputElement || !inputElement.value || activeDays.length === 0) return;
    
    const currentDate = inputElement.value;
    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    const minDate = activeDays[0];
    const maxDate = activeDays[activeDays.length - 1];
    
    const newDate = addDays(currentDate, deltaDays);
    
    if (deltaDays > 0) {
        if (inputElement === dateFrom && newDate > dateTo.value) return;
        if (newDate > maxDate) return;
    } else {
        if (inputElement === dateTo && newDate < dateFrom.value) return;
        if (newDate < minDate) return;
    }
    
    inputElement.value = newDate;
    applyDateFilter();
    updateDateButtons();
}

// Setup date control buttons
function setupDateButtons() {
    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    
    setupDateButton('btn-date-from-minus', dateFrom, -1);
    setupDateButton('btn-date-from-plus', dateFrom, 1);
    setupDateButton('btn-date-to-minus', dateTo, -1);
    setupDateButton('btn-date-to-plus', dateTo, 1);
}

function setupDateButton(buttonId, dateInput, deltaDays) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    let scrollTimeout = null;
    let scrollInterval = null;
    let isLongPress = false;
    
    const changeDate = () => {
        adjustDate(dateInput, deltaDays);
    };
    
    const startAutoScroll = (e) => {
        if (button.disabled) return;
        if (e.cancelable) e.preventDefault();
        
        isLongPress = false;
        changeDate();
        
        scrollTimeout = setTimeout(() => {
            isLongPress = true;
            changeDate();
            scrollInterval = setInterval(changeDate, 150);
        }, 600);
    };
    
    const stopAutoScroll = () => {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
            scrollTimeout = null;
        }
        if (scrollInterval) {
            clearInterval(scrollInterval);
            scrollInterval = null;
        }
        isLongPress = false;
    };
    
    button.addEventListener('pointerdown', startAutoScroll);
    window.addEventListener('pointerup', stopAutoScroll);
    window.addEventListener('pointercancel', stopAutoScroll);
    button.addEventListener('pointerleave', stopAutoScroll);
    
    button.addEventListener('click', (e) => {
        if (isLongPress) {
            e.preventDefault();
            return;
        }
        if (!button.disabled) {
            changeDate();
        }
    });
}

function updateDateButtons() {
    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    
    if (!dateFrom || !dateTo || !activeDays.length) return;
    
    const minDate = activeDays[0];
    const maxDate = activeDays[activeDays.length - 1];
    
    document.getElementById('btn-date-from-minus').disabled = (dateFrom.value <= minDate);
    document.getElementById('btn-date-from-plus').disabled = (dateFrom.value >= dateTo.value || dateFrom.value >= maxDate);
    document.getElementById('btn-date-to-minus').disabled = (dateTo.value <= dateFrom.value || dateTo.value <= minDate);
    document.getElementById('btn-date-to-plus').disabled = (dateTo.value >= maxDate);
}

// Global keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Check for Ctrl (or Cmd on Mac) without Shift or Alt
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const dateFrom = document.getElementById('date-from');
        const dateTo = document.getElementById('date-to');
        let targetInput = null;
        let delta = 0;

        if (e.key === 'ArrowRight') {
            targetInput = dateFrom;
            delta = 1;
        } else if (e.key === 'ArrowLeft') {
            targetInput = dateFrom;
            delta = -1;
        } else if (e.key === 'ArrowUp') {
            targetInput = dateTo;
            delta = 1;
        } else if (e.key === 'ArrowDown') {
            targetInput = dateTo;
            delta = -1;
        }

        if (targetInput && delta !== 0) {
            e.preventDefault(); // Prevent default browser scrolling
            adjustDate(targetInput, delta);
        }
    }
});

async function init() {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    
    try {
        loadingText.textContent = "Fetching data from server...";
        console.time("Fetch + Parse");
        
        const response = await fetch('/graph_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.timeEnd("Fetch + Parse");
        console.log("Data loaded. Nodes:", data.nodes.length, "Links:", data.links.length);
        
        if (!data.nodes || !data.links || !data.metrics) {
            throw new Error("Invalid data structure in JSON");
        }
        
        allLinks = data.links;
        activeDays = data.metrics.active_days;
        allNodes = data.nodes;
        
        setupDateInputs(activeDays);
        setupDateButtons();
        
        loadingText.textContent = "Rendering graph (instant)...";
        console.time("Graph Render");
        
        buildInitialGraph(allNodes, allLinks);
        
        console.timeEnd("Graph Render");
        loadingText.textContent = "Applying initial filters...";
        
        applyDateFilter();
        updateDateButtons();
        
    } catch (error) {
        console.error("CRITICAL ERROR:", error);
        loadingText.textContent = "Error loading data. Check console (F12).";
        loadingText.style.color = "#e31e24";
    } finally {
        const overlay = document.getElementById('loading-overlay');
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 500);
    }
}

function setupDateInputs(days) {
    if (days.length === 0) return;
    
    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    
    dateFrom.min = days[0];
    dateFrom.max = days[days.length - 1];
    dateFrom.value = days[0];
    
    dateTo.min = days[0];
    dateTo.max = days[days.length - 1];
    dateTo.value = days[days.length - 1];
    
    dateFrom.addEventListener('change', () => {
        applyDateFilter();
        updateDateButtons();
    });
    dateTo.addEventListener('change', () => {
        applyDateFilter();
        updateDateButtons();
    });
}

function applyDateFilter() {
    if (!cy) return;

    const dateFromVal = document.getElementById('date-from').value;
    const dateToVal = document.getElementById('date-to').value;

    console.time("Filtering");

    const activeAuthorIds = new Set();
    const activeRepoIds = new Set();
    const activeDaysInRange = new Set();
    
    let filteredTotalCommits = 0;
    const authorFilteredCommitsMap = new Map();

    allLinks.forEach(link => {
        const hasActivity = link.active_days.some(day => day >= dateFromVal && day <= dateToVal);
        if (hasActivity) {
            activeAuthorIds.add(link.source);
            activeRepoIds.add(link.target);
            
            link.active_days.forEach(day => {
                if (day >= dateFromVal && day <= dateToVal) {
                    activeDaysInRange.add(day);
                }
            });
        }
    });

    allNodes.forEach(node => {
        if (node.node_type === 'author' && activeAuthorIds.has(node.id)) {
            if (node.cumulative_commits) {
                const commits = getCommitsInRange(node.cumulative_commits, dateFromVal, dateToVal);
                authorFilteredCommitsMap.set(node.id, commits);
                filteredTotalCommits += commits;
            } else {
                authorFilteredCommitsMap.set(node.id, 0);
            }
        }
    });

    cy.startBatch();
    cy.elements().hide();

    allNodes.forEach(node => {
        if (node.node_type === 'author') {
            const el = cy.getElementById(node.id);
            if (activeAuthorIds.has(node.id)) {
                const filteredCommits = authorFilteredCommitsMap.get(node.id) || 0;
                el.data('weight', Math.max(1, filteredCommits)); 
                el.show();
            }
        }
    });

    allNodes.forEach(node => {
        if (node.node_type === 'repo') {
            const el = cy.getElementById(node.id);
            if (activeRepoIds.has(node.id)) {
                el.data('weight', node.total_commits);
                el.show();
            }
        }
    });

    allLinks.forEach(link => {
        const hasActivity = link.active_days.some(day => day >= dateFromVal && day <= dateToVal);
        if (hasActivity) {
            const el = cy.getElementById(link.source + '-' + link.target);
            if (el) el.show();
        }
    });

    cy.endBatch();

    const visibleElements = cy.elements(':visible');
    if (visibleElements.length > 0) {
        cy.fit(visibleElements, 30);
    }

    const topAuthorsList = [];
    allNodes.forEach(node => {
        if (node.node_type === 'author' && activeAuthorIds.has(node.id)) {
            topAuthorsList.push({ 
                label: node.label, 
                commits: authorFilteredCommitsMap.get(node.id) || 0 
            });
        }
    });
    topAuthorsList.sort((a, b) => b.commits - a.commits);

    updateMetricsPanel({
        totalAuthors: activeAuthorIds.size,
        totalRepos: activeRepoIds.size,
        totalCommits: filteredTotalCommits,
        activeDays: activeDaysInRange.size,
        topAuthors: topAuthorsList.slice(0, 10).map(a => [a.label, a.commits])
    });

    console.timeEnd("Filtering");
}

function updateMetricsPanel(metrics) {
    const panel = document.getElementById('metrics-panel');
    const topAuthorsHtml = metrics.topAuthors.map(([name, count]) => 
        `<li>${name} - <strong>${count}</strong> commits</li>`
    ).join('');
    
    panel.innerHTML = `
        <p><strong>Total Authors:</strong> ${metrics.totalAuthors}</p>
        <p><strong>Total Repos:</strong> ${metrics.totalRepos}</p>
        <p><strong>Total Commits:</strong> ${metrics.totalCommits}</p>
        <p><strong>Active Days:</strong> ${metrics.activeDays}</p>
        <p><strong>Top Contributors:</strong></p>
        <ul style="margin: 5px 0; padding-left: 20px;">${topAuthorsHtml}</ul>
    `;
}

function buildInitialGraph(nodes, links) {
    const container = document.getElementById('cy');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const elements = [
        ...nodes.map(node => ({
            data: { 
                id: node.id, 
                label: node.label, 
                type: node.node_type,
                weight: node.total_commits
            },
            position: {
                x: node.x * width,
                y: node.y * height
            }
        })),
        ...links.map(link => ({
            data: { 
                id: link.source + '-' + link.target,
                source: link.source, 
                target: link.target, 
                total_commits: link.total_commits,
                active_days: link.active_days,
                first_day: link.first_day,
                last_day: link.last_day
            }
        }))
    ];

    cy = cytoscape({
        container: container,
        elements: elements,
        style: [
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'color': '#0c2834',
                    'text-outline-width': 1,
                    'text-outline-color': '#ffffff',
                    'font-size': '10px',
                    'font-weight': '600',
                    'text-max-width': '150px',
                    'text-wrap': 'wrap',
                    'min-zoomed-font-size': '8px',
                    'width': 'mapData(weight, 1, 2000, 40, 100)',
                    'height': 'mapData(weight, 1, 2000, 40, 100)'
                }
            },
            {
                selector: 'node[type = "author"]',
                style: {
                    'background-color': '#00adee',
                    'shape': 'ellipse',
                    'border-width': 2,
                    'border-color': '#ffffff',
                    'border-opacity': 0.9,
                    'text-halign': 'left', 
                    'text-margin-x': -10,
                    'text-outline-width': 0
                }
            },
            {
                selector: 'node[type = "repo"]',
                style: {
                    'background-color': '#1e73be',
                    'shape': 'rectangle',
                    'border-width': 3,
                    'border-color': '#ffffff',
                    'border-opacity': 0.9,
                    'text-halign': 'right', 
                    'text-margin-x': 10, 
                    'font-size': '11px',
                    'text-max-width': '180px'
                }
            },
            {
                selector: 'node:hover',
                style: {
                    'font-size': '13px',
                    'text-outline-width': 2,
                    'border-width': 4,
                    'border-color': '#ffd900',
                    'z-index': 999
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 'mapData(total_commits, 1, 1000, 2, 8)',
                    'line-color': '#9cbedc',
                    'opacity': 0.7,
                    'curve-style': 'bezier',
                    'target-arrow-shape': 'none'
                }
            }
        ],
        layout: {
            name: 'preset',
            animate: false,
            fit: true,
            padding: 30
        },
        userZoomingEnabled: true,
        userPanningEnabled: true,
        minZoom: 0.2,
        maxZoom: 3,
    });
}

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (cy) {
            applyDateFilter();
        }
    }, 200);
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (!cy) return;
        cy.on('tap', 'node', function(evt){
            console.log('Clicked:', evt.target.data('label'));
        });
        cy.on('mouseover', 'node', function(evt) {
            evt.target.style({ 'border-width': 4, 'border-color': '#ffd900' });
        });
        cy.on('mouseout', 'node', function(evt) {
            evt.target.style({ 'border-width': 2, 'border-color': '#ffffff' });
        });
    }, 1000);
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}