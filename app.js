/**
 * QuizView - Interactive Application Logic
 * Pure client-side PDF extraction, state management, and quiz interactions
 */

(function () {
    'use strict';

    // State Variables
    let currentQuestions = [];
    let currentQuestionIndex = 0;
    let quizState = {}; // { [index]: { solved: boolean, attempts: string[], firstTryCorrect: boolean, selectedAnswer: string } }
    let rawPdfText = '';
    let wrongOptionTimer = null;
    let currentlyRedButton = null;

    // Initialize PDF.js worker safely with cross-origin Blob fallback for GitHub Pages
    if (typeof pdfjsLib !== 'undefined') {
        try {
            const workerBlob = new Blob(
                [`importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');`],
                { type: 'application/javascript' }
            );
            pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(workerBlob));
        } catch (e) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }

    const parser = new MCQParser();

    // DOM Elements
    const elements = {
        // Views
        uploadView: document.getElementById('uploadView'),
        quizView: document.getElementById('quizView'),
        resultsView: document.getElementById('resultsView'),

        // Upload zone
        dropzone: document.getElementById('dropzone'),
        pdfFileInput: document.getElementById('pdfFileInput'),
        browseBtn: document.getElementById('browseBtn'),
        loadingBox: document.getElementById('loadingBox'),
        loadingText: document.getElementById('loadingText'),
        sampleQuizBtn: document.getElementById('sampleQuizBtn'),
        downloadSamplePdfBtn: document.getElementById('downloadSamplePdfBtn'),

        // Top Header
        headerUploadBtn: document.getElementById('headerUploadBtn'),
        headerEditorBtn: document.getElementById('headerEditorBtn'),
        logoBtn: document.getElementById('logoBtn'),

        // Quiz Viewport
        progressCounter: document.getElementById('progressCounter'),
        scoreBadgeText: document.getElementById('scoreBadgeText'),
        progressBarFill: document.getElementById('progressBarFill'),
        questionNavStrip: document.getElementById('questionNavStrip'),
        questionText: document.getElementById('questionText'),
        optionsContainer: document.getElementById('optionsContainer'),
        explanationBox: document.getElementById('explanationBox'),
        explanationContent: document.getElementById('explanationContent'),
        prevQuestionBtn: document.getElementById('prevQuestionBtn'),
        nextQuestionBtn: document.getElementById('nextQuestionBtn'),

        // Results Viewport
        scorePercent: document.getElementById('scorePercent'),
        scoreCircleProgress: document.getElementById('scoreCircleProgress'),
        statTotalQ: document.getElementById('statTotalQ'),
        statCorrect: document.getElementById('statCorrect'),
        statAccuracy: document.getElementById('statAccuracy'),
        reviewList: document.getElementById('reviewList'),
        restartQuizBtn: document.getElementById('restartQuizBtn'),
        retryMissedBtn: document.getElementById('retryMissedBtn'),
        resultsUploadBtn: document.getElementById('resultsUploadBtn'),

        // Editor Modal
        editorModal: document.getElementById('editorModal'),
        closeEditorBtn: document.getElementById('closeEditorBtn'),
        saveEditorBtn: document.getElementById('saveEditorBtn'),
        editorContainer: document.getElementById('editorContainer'),
        addQuestionBtn: document.getElementById('addQuestionBtn'),

        // Toast
        toast: document.getElementById('toast'),
        toastText: document.getElementById('toastText')
    };

    // ==========================================================================
    // Event Listeners Initialization
    // ==========================================================================
    function init() {
        setupUploadEvents();
        setupQuizControls();
        setupResultsControls();
        setupEditorEvents();
        setupKeyboardNavigation();

        // Check if there is sample data available
        if (elements.sampleQuizBtn) {
            elements.sampleQuizBtn.addEventListener('click', loadSampleQuiz);
        }

        if (elements.downloadSamplePdfBtn) {
            elements.downloadSamplePdfBtn.addEventListener('click', generateAndDownloadSamplePdf);
        }

        // Header actions
        if (elements.headerUploadBtn) {
            elements.headerUploadBtn.addEventListener('click', () => switchView('upload'));
        }
        if (elements.logoBtn) {
            elements.logoBtn.addEventListener('click', () => switchView('upload'));
        }
        if (elements.headerEditorBtn) {
            elements.headerEditorBtn.addEventListener('click', openEditorModal);
        }
    }

    // ==========================================================================
    // View Switching
    // ==========================================================================
    function switchView(viewName) {
        elements.uploadView.classList.remove('active');
        elements.quizView.classList.remove('active');
        elements.resultsView.classList.remove('active');

        if (viewName === 'upload') {
            elements.uploadView.classList.add('active');
            elements.headerEditorBtn.style.display = 'none';
        } else if (viewName === 'quiz') {
            elements.quizView.classList.add('active');
            elements.headerEditorBtn.style.display = 'inline-flex';
        } else if (viewName === 'results') {
            elements.resultsView.classList.add('active');
            elements.headerEditorBtn.style.display = 'inline-flex';
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ==========================================================================
    // Upload & Drag-and-Drop Handling
    // ==========================================================================
    function setupUploadEvents() {
        const dropzone = elements.dropzone;
        const fileInput = elements.pdfFileInput;

        elements.browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });

        dropzone.addEventListener('click', () => {
            fileInput.click();
        });

        // Drag and drop handlers
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                handleFileSelection(files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFileSelection(e.target.files[0]);
            }
        });
    }

    function handleFileSelection(file) {
        if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
            showToast('Please select a valid PDF file (.pdf)');
            return;
        }

        showLoading(true, `Reading "${file.name}"...`);

        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const typedarray = new Uint8Array(e.target.result);
                await extractAndProcessPdf(typedarray);
            } catch (err) {
                console.error('PDF parsing error:', err);
                showLoading(false);
                showToast('Failed to parse PDF: ' + (err.message || 'Unknown error'));
            }
        };

        reader.onerror = function () {
            showLoading(false);
            showToast('Error reading the selected file.');
        };

        reader.readAsArrayBuffer(file);
    }

    // ==========================================================================
    // PDF.js Text Extraction
    // ==========================================================================
    async function extractAndProcessPdf(pdfData) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js library could not be loaded. Check your internet connection.');
        }

        showLoading(true, 'Opening PDF document...');
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;

        let accumulatedText = '';

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            showLoading(true, `Extracting text from page ${pageNum} of ${totalPages}...`);
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent({ normalizeWhitespace: true });
            
            // Layout-aware reconstruction:
            // Group text items by their vertical position (Y coordinate)
            const items = textContent.items;
            if (items.length > 0) {
                // Sort by Y descending (top to bottom), then X ascending (left to right)
                items.sort((a, b) => {
                    const yDiff = b.transform[5] - a.transform[5];
                    if (Math.abs(yDiff) > 3) {
                        return yDiff;
                    }
                    return a.transform[4] - b.transform[4];
                });

                let lastY = null;
                let pageStr = '';

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const currentY = item.transform[5];

                    if (lastY !== null && Math.abs(currentY - lastY) > 5) {
                        pageStr += '\n';
                    } else if (lastY !== null) {
                        pageStr += ' ';
                    }

                    pageStr += item.str;
                    lastY = currentY;
                }

                accumulatedText += pageStr + '\n\n';
            }
        }

        rawPdfText = accumulatedText;
        showLoading(true, 'Detecting and structuring MCQs...');

        // Parse questions
        const extractedQuestions = parser.parse(accumulatedText);

        showLoading(false);

        if (!extractedQuestions || extractedQuestions.length === 0) {
            alert('No multiple-choice questions were detected in this PDF.\n\nTips:\n- Ensure the PDF contains selectable text (not scanned images).\n- Questions should have standard numbering (e.g. 1. or Q1) and option labels (A, B, C, D).\n\nYou can also click "Try Sample Quiz" to test the quiz interface!');
            return;
        }

        // Check if answers were automatically defaulted
        const autoAssignedCount = extractedQuestions.filter(q => q.answerAutoAssigned).length;
        if (autoAssignedCount > 0) {
            showToast(`${extractedQuestions.length} MCQs loaded! (Note: ${autoAssignedCount} questions had no answer key in PDF; review answers in Editor if needed)`);
        } else {
            showToast(`Successfully extracted ${extractedQuestions.length} questions!`);
        }

        startQuizWithQuestions(extractedQuestions);
    }

    function showLoading(show, text = 'Processing...') {
        if (show) {
            elements.loadingBox.classList.add('active');
            elements.loadingText.textContent = text;
        } else {
            elements.loadingBox.classList.remove('active');
        }
    }

    // ==========================================================================
    // Sample Quiz Loader
    // ==========================================================================
    function loadSampleQuiz() {
        if (window.SAMPLE_QUIZ && window.SAMPLE_QUIZ.length > 0) {
            startQuizWithQuestions(window.SAMPLE_QUIZ);
            showToast(`Loaded ${window.SAMPLE_QUIZ.length} sample questions!`);
        } else {
            showToast('Sample quiz data not found.');
        }
    }

    // ==========================================================================
    // Quiz State & Rendering
    // ==========================================================================
    function startQuizWithQuestions(questions) {
        currentQuestions = JSON.parse(JSON.stringify(questions)); // Deep clone
        currentQuestionIndex = 0;
        quizState = {};

        // Initialize state for each question
        currentQuestions.forEach((q, idx) => {
            quizState[idx] = {
                solved: false,
                attempts: [],
                firstTryCorrect: false,
                selectedAnswer: null
            };
        });

        renderQuestionNavStrip();
        renderCurrentQuestion();
        switchView('quiz');
    }

    function renderQuestionNavStrip() {
        elements.questionNavStrip.innerHTML = '';

        currentQuestions.forEach((q, idx) => {
            const pill = document.createElement('button');
            pill.className = 'q-nav-pill';
            pill.textContent = idx + 1;
            pill.title = `Go to Question ${idx + 1}`;
            pill.setAttribute('aria-label', `Question ${idx + 1}`);

            updatePillState(pill, idx);

            pill.addEventListener('click', () => {
                goToQuestion(idx);
            });

            elements.questionNavStrip.appendChild(pill);
        });
    }

    function updatePillState(pill, idx) {
        pill.classList.remove('active', 'solved', 'has-attempts');
        const state = quizState[idx];

        if (idx === currentQuestionIndex) {
            pill.classList.add('active');
        }

        if (state.solved) {
            pill.classList.add('solved');
        } else if (state.attempts.length > 0) {
            pill.classList.add('has-attempts');
        }
    }

    function renderCurrentQuestion() {
        clearPreviousRedStates();

        const q = currentQuestions[currentQuestionIndex];
        const state = quizState[currentQuestionIndex];

        // Update progress counter: "Question X of Y"
        const qNum = currentQuestionIndex + 1;
        const totalQ = currentQuestions.length;
        elements.progressCounter.textContent = `Question ${qNum} of ${totalQ}`;

        // Update progress bar
        const percent = Math.round((qNum / totalQ) * 100);
        elements.progressBarFill.style.width = `${percent}%`;

        // Update live score badge
        const solvedCount = Object.values(quizState).filter(s => s.solved).length;
        elements.scoreBadgeText.textContent = `${solvedCount} / ${totalQ} Solved`;

        // Update Nav strip pills
        const pills = elements.questionNavStrip.querySelectorAll('.q-nav-pill');
        pills.forEach((p, idx) => updatePillState(p, idx));

        // Scroll active pill into view
        if (pills[currentQuestionIndex]) {
            pills[currentQuestionIndex].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }

        // Render question text
        elements.questionText.textContent = `${q.number || qNum}. ${q.question}`;

        // Render Options
        renderOptions(q, state);

        // Render Explanation
        if (state.solved) {
            elements.explanationBox.classList.add('visible');
            elements.explanationContent.textContent = q.explanation || `Option ${q.correctAnswer} is the correct answer.`;
            elements.nextQuestionBtn.classList.add('next-btn-pulse');
        } else {
            elements.explanationBox.classList.remove('visible');
            elements.explanationContent.textContent = '';
            elements.nextQuestionBtn.classList.remove('next-btn-pulse');
        }

        // Update navigation buttons
        elements.prevQuestionBtn.disabled = (currentQuestionIndex === 0);

        if (currentQuestionIndex === totalQ - 1) {
            elements.nextQuestionBtn.innerHTML = `<span>View Results</span> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
        } else {
            elements.nextQuestionBtn.innerHTML = `<span>Next Question</span> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
        }
    }

    /**
     * Clears any active red temporary state and resets timers.
     * Selecting another option removes the previous red state.
     */
    function clearPreviousRedStates() {
        if (wrongOptionTimer) {
            clearTimeout(wrongOptionTimer);
            wrongOptionTimer = null;
        }
        if (currentlyRedButton) {
            currentlyRedButton.classList.remove('wrong-temp');
            currentlyRedButton = null;
        }
        if (elements.optionsContainer) {
            const allBtns = elements.optionsContainer.querySelectorAll('.option-btn');
            allBtns.forEach(btn => btn.classList.remove('wrong-temp', 'attempted-wrong'));
        }
    }

    /**
     * Renders option buttons with repeated selection capability.
     * Wrong choices turn red temporarily with shake.
     * Selecting another option removes the previous red state.
     * Correct choice turns green and reveals 1-2 line explanation.
     */
    function renderOptions(q, state) {
        elements.optionsContainer.innerHTML = '';

        q.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.dataset.key = opt.key;

            const isCorrect = (opt.key.toUpperCase() === q.correctAnswer.toUpperCase());
            const isAlreadySolved = state.solved;

            // Set current classes based on state
            if (isAlreadySolved) {
                btn.classList.add('locked');
                if (isCorrect) {
                    btn.classList.add('correct');
                } else {
                    btn.classList.add('option-dimmed');
                }
            }

            btn.innerHTML = `
                <span class="option-key">${opt.key}</span>
                <span class="option-text">${opt.text}</span>
                <span class="option-status-icon">
                    ${isCorrect ? '✓' : '✕'}
                </span>
            `;

            // Option selection click handler
            btn.addEventListener('click', () => {
                handleOptionClick(opt.key, btn);
            });

            elements.optionsContainer.appendChild(btn);
        });
    }

    /**
     * Handles user selecting an option repeatedly
     */
    function handleOptionClick(selectedKey, clickedBtn) {
        const q = currentQuestions[currentQuestionIndex];
        const state = quizState[currentQuestionIndex];
        const correctKey = q.correctAnswer.toUpperCase();
        selectedKey = selectedKey.toUpperCase();

        // If the question is already solved, don't allow selecting options
        if (state.solved) {
            return;
        }

        // Core behavior: selecting another option immediately removes any previous red state
        clearPreviousRedStates();

        // CASE 1: WRONG CHOICE SELECTED
        if (selectedKey !== correctKey) {
            // Record attempt for stats
            if (!state.attempts.includes(selectedKey)) {
                state.attempts.push(selectedKey);
            }

            // Wrong option turns RED temporarily with shake
            clickedBtn.classList.add('wrong-temp');
            currentlyRedButton = clickedBtn;

            // Play subtle vibration on supported mobile devices
            if (navigator.vibrate) {
                navigator.vibrate(80);
            }

            // After temporary flash (~1000ms), remove red state smoothly
            wrongOptionTimer = setTimeout(() => {
                clickedBtn.classList.remove('wrong-temp');
                if (currentlyRedButton === clickedBtn) {
                    currentlyRedButton = null;
                }
                wrongOptionTimer = null;
            }, 1000);

            // Update navigator strip
            const pills = elements.questionNavStrip.querySelectorAll('.q-nav-pill');
            if (pills[currentQuestionIndex]) {
                updatePillState(pills[currentQuestionIndex], currentQuestionIndex);
            }
            return;
        }

        // CASE 2: CORRECT CHOICE SELECTED!
        if (state.attempts.length === 0) {
            state.firstTryCorrect = true;
        }
        state.solved = true;
        state.selectedAnswer = selectedKey;

        // Turn green and lock
        clickedBtn.classList.add('correct', 'locked');

        // All other options are dimmed and locked
        const allOptionBtns = elements.optionsContainer.querySelectorAll('.option-btn');
        allOptionBtns.forEach(btn => {
            btn.classList.add('locked');
            if (btn !== clickedBtn) {
                btn.classList.add('option-dimmed');
            }
        });

        // Reveal 1-2 line explanation smoothly
        elements.explanationBox.classList.add('visible');
        elements.explanationContent.textContent = q.explanation || `Option ${q.correctAnswer} is the verified correct answer.`;

        // Pulse the Next Question button to encourage moving forward
        elements.nextQuestionBtn.classList.add('next-btn-pulse');

        // Update score badge and navigator strip
        const totalQ = currentQuestions.length;
        const solvedCount = Object.values(quizState).filter(s => s.solved).length;
        elements.scoreBadgeText.textContent = `${solvedCount} / ${totalQ} Solved`;

        const pills = elements.questionNavStrip.querySelectorAll('.q-nav-pill');
        if (pills[currentQuestionIndex]) {
            updatePillState(pills[currentQuestionIndex], currentQuestionIndex);
        }
    }

    // ==========================================================================
    // Navigation Handlers
    // ==========================================================================
    function setupQuizControls() {
        elements.nextQuestionBtn.addEventListener('click', handleNextQuestion);
        elements.prevQuestionBtn.addEventListener('click', handlePrevQuestion);
    }

    function handleNextQuestion() {
        if (currentQuestionIndex < currentQuestions.length - 1) {
            goToQuestion(currentQuestionIndex + 1);
        } else {
            showQuizResults();
        }
    }

    function handlePrevQuestion() {
        if (currentQuestionIndex > 0) {
            goToQuestion(currentQuestionIndex - 1);
        }
    }

    function goToQuestion(idx) {
        if (idx >= 0 && idx < currentQuestions.length) {
            currentQuestionIndex = idx;
            renderCurrentQuestion();
        }
    }

    // Keyboard Shortcuts (A/B/C/D or 1/2/3/4 to choose; Arrow keys or Enter for next/prev)
    function setupKeyboardNavigation() {
        window.addEventListener('keydown', (e) => {
            // Do not capture keyboard if an input/textarea or modal is active
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || elements.editorModal.classList.contains('active')) {
                return;
            }

            // Only active in quiz view
            if (!elements.quizView.classList.contains('active')) return;

            const key = e.key.toUpperCase();

            // Arrow Right / Enter -> Next Question
            if (e.key === 'ArrowRight' || (e.key === 'Enter' && quizState[currentQuestionIndex]?.solved)) {
                e.preventDefault();
                handleNextQuestion();
                return;
            }

            // Arrow Left -> Previous Question
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handlePrevQuestion();
                return;
            }

            // Number 1-4 or letter A-D selection
            let optKey = null;
            if (['A', 'B', 'C', 'D', 'E', 'F'].includes(key)) {
                optKey = key;
            } else if (['1', '2', '3', '4', '5', '6'].includes(key)) {
                const charCode = 65 + (parseInt(key, 10) - 1);
                optKey = String.fromCharCode(charCode);
            }

            if (optKey) {
                const targetBtn = elements.optionsContainer.querySelector(`.option-btn[data-key="${optKey}"]`);
                if (targetBtn) {
                    targetBtn.click();
                }
            }
        });
    }

    // ==========================================================================
    // Results & Summary
    // ==========================================================================
    function showQuizResults() {
        const total = currentQuestions.length;
        const solved = Object.values(quizState).filter(s => s.solved).length;
        const firstTryCount = Object.values(quizState).filter(s => s.firstTryCorrect).length;
        const percent = Math.round((solved / total) * 100);
        const accuracy = Math.round((firstTryCount / total) * 100);

        elements.scorePercent.textContent = `${percent}%`;
        elements.statTotalQ.textContent = total;
        elements.statCorrect.textContent = `${solved} / ${total}`;
        elements.statAccuracy.textContent = `${accuracy}%`;

        // Animate SVG circular progress
        const radius = 54;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percent / 100) * circumference;
        elements.scoreCircleProgress.style.strokeDasharray = `${circumference} ${circumference}`;
        elements.scoreCircleProgress.style.strokeDashoffset = offset;

        // Populate question review breakdown
        renderReviewList();

        switchView('results');
    }

    function renderReviewList() {
        elements.reviewList.innerHTML = '';

        currentQuestions.forEach((q, idx) => {
            const state = quizState[idx];
            const item = document.createElement('div');
            item.className = 'review-item';

            const statusBadge = state.firstTryCorrect 
                ? '<span style="color:#10b981; font-weight:600;">✓ Correct (1st Try)</span>'
                : (state.solved 
                    ? `<span style="color:#f59e0b; font-weight:600;">✓ Solved (${state.attempts.length} retries)</span>`
                    : '<span style="color:#ef4444; font-weight:600;">✕ Unsolved</span>');

            const correctOpt = q.options.find(o => o.key === q.correctAnswer);
            const correctText = correctOpt ? correctOpt.text : '';

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                    <div class="review-q-title">Q${idx + 1}. ${escapeHtml(q.question)}</div>
                    <div>${statusBadge}</div>
                </div>
                <div class="review-ans-row">
                    <strong>Correct Option (${q.correctAnswer}):</strong> ${escapeHtml(correctText)}
                </div>
                ${q.explanation ? `<div class="review-exp-row"><strong>Explanation:</strong> ${escapeHtml(q.explanation)}</div>` : ''}
            `;

            elements.reviewList.appendChild(item);
        });
    }

    function setupResultsControls() {
        elements.restartQuizBtn.addEventListener('click', () => {
            startQuizWithQuestions(currentQuestions);
        });

        elements.retryMissedBtn.addEventListener('click', () => {
            const missedQuestions = currentQuestions.filter((q, idx) => !quizState[idx].firstTryCorrect);
            if (missedQuestions.length === 0) {
                showToast('Congratulations! You solved all questions on the first attempt.');
                return;
            }
            startQuizWithQuestions(missedQuestions);
            showToast(`Retrying ${missedQuestions.length} missed/retried questions!`);
        });

        elements.resultsUploadBtn.addEventListener('click', () => {
            switchView('upload');
        });
    }

    // ==========================================================================
    // Question Editor & Review Modal
    // ==========================================================================
    function setupEditorEvents() {
        elements.closeEditorBtn.addEventListener('click', closeEditorModal);
        elements.saveEditorBtn.addEventListener('click', saveEditorChanges);
        elements.addQuestionBtn.addEventListener('click', addNewQuestionInEditor);

        // Click outside modal dialog to dismiss
        elements.editorModal.addEventListener('click', (e) => {
            if (e.target === elements.editorModal) {
                closeEditorModal();
            }
        });
    }

    function openEditorModal() {
        if (!currentQuestions || currentQuestions.length === 0) {
            showToast('No questions currently loaded to edit.');
            return;
        }

        renderEditorList();
        elements.editorModal.classList.add('active');
    }

    function closeEditorModal() {
        elements.editorModal.classList.remove('active');
    }

    function renderEditorList() {
        elements.editorContainer.innerHTML = '';

        currentQuestions.forEach((q, idx) => {
            const card = document.createElement('div');
            card.className = 'editor-card';
            card.dataset.index = idx;

            let optionsHtml = '';
            q.options.forEach((opt) => {
                const isSelected = (opt.key === q.correctAnswer);
                optionsHtml += `
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem;">
                        <input type="radio" name="ans_${idx}" value="${opt.key}" ${isSelected ? 'checked' : ''} title="Mark as correct answer">
                        <span style="font-weight:700; width:20px;">${opt.key}</span>
                        <input type="text" class="editor-input opt-text-input" data-key="${opt.key}" value="${escapeHtml(opt.text)}" placeholder="Option text">
                    </div>
                `;
            });

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="editor-label">Question ${idx + 1}</span>
                    <button class="btn btn-ghost btn-sm delete-q-btn" style="color:#ef4444;" title="Delete this question">Delete</button>
                </div>
                <textarea class="editor-textarea q-text-input" placeholder="Question prompt">${escapeHtml(q.question)}</textarea>
                <div class="editor-label" style="margin-top:0.4rem;">Options (select radio for correct answer)</div>
                <div class="editor-options-box">${optionsHtml}</div>
                <div class="editor-label" style="margin-top:0.4rem;">1–2 Line Explanation</div>
                <input type="text" class="editor-input q-exp-input" value="${escapeHtml(q.explanation || '')}" placeholder="Explanation shown when answered correctly">
            `;

            card.querySelector('.delete-q-btn').addEventListener('click', () => {
                card.remove();
            });

            elements.editorContainer.appendChild(card);
        });
    }

    function addNewQuestionInEditor() {
        const newIndex = elements.editorContainer.querySelectorAll('.editor-card').length;
        const card = document.createElement('div');
        card.className = 'editor-card';
        card.dataset.index = newIndex;

        const defaultOptions = [
            { key: 'A', text: 'Option A' },
            { key: 'B', text: 'Option B' },
            { key: 'C', text: 'Option C' },
            { key: 'D', text: 'Option D' }
        ];

        let optionsHtml = '';
        defaultOptions.forEach((opt, oIdx) => {
            optionsHtml += `
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem;">
                    <input type="radio" name="ans_${newIndex}" value="${opt.key}" ${oIdx === 0 ? 'checked' : ''} title="Mark as correct answer">
                    <span style="font-weight:700; width:20px;">${opt.key}</span>
                    <input type="text" class="editor-input opt-text-input" data-key="${opt.key}" value="${opt.text}" placeholder="Option text">
                </div>
            `;
        });

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="editor-label">Question ${newIndex + 1} (New)</span>
                <button class="btn btn-ghost btn-sm delete-q-btn" style="color:#ef4444;" title="Delete this question">Delete</button>
            </div>
            <textarea class="editor-textarea q-text-input" placeholder="Question prompt">New Question prompt here</textarea>
            <div class="editor-label" style="margin-top:0.4rem;">Options (select radio for correct answer)</div>
            <div class="editor-options-box">${optionsHtml}</div>
            <div class="editor-label" style="margin-top:0.4rem;">1–2 Line Explanation</div>
            <input type="text" class="editor-input q-exp-input" value="Option A is the correct answer." placeholder="Explanation shown when answered correctly">
        `;

        card.querySelector('.delete-q-btn').addEventListener('click', () => {
            card.remove();
        });

        elements.editorContainer.appendChild(card);
        card.scrollIntoView({ behavior: 'smooth' });
    }

    function saveEditorChanges() {
        const cards = elements.editorContainer.querySelectorAll('.editor-card');
        const updatedList = [];

        cards.forEach((card, idx) => {
            const qText = card.querySelector('.q-text-input').value.trim();
            const expText = card.querySelector('.q-exp-input').value.trim();
            const checkedRadio = card.querySelector('input[type="radio"]:checked');
            const correctAns = checkedRadio ? checkedRadio.value : 'A';

            const optInputs = card.querySelectorAll('.opt-text-input');
            const options = [];
            optInputs.forEach(input => {
                options.push({
                    key: input.dataset.key,
                    text: input.value.trim()
                });
            });

            if (qText && options.length >= 2) {
                updatedList.push({
                    id: idx + 1,
                    number: idx + 1,
                    question: qText,
                    options: options,
                    correctAnswer: correctAns,
                    explanation: expText || `Option ${correctAns} is correct.`
                });
            }
        });

        if (updatedList.length === 0) {
            showToast('Quiz must contain at least 1 valid question with 2+ options.');
            return;
        }

        closeEditorModal();
        startQuizWithQuestions(updatedList);
        showToast('Changes saved successfully!');
    }

    // ==========================================================================
    // On-The-Fly Sample PDF Generator
    // ==========================================================================
    function generateAndDownloadSamplePdf() {
        // Construct a standard, valid PDF document containing MCQs with answer keys and explanations
        const stream = `BT
/F1 16 Tf
50 730 Td
(Computer Science & Web Tech Quiz) Tj
/F1 11 Tf
0 -35 Td
(1. What does CSS stand for in web development?) Tj
0 -18 Td
(A) Creative Style Sheets) Tj
0 -16 Td
(B) Cascading Style Sheets) Tj
0 -16 Td
(C) Computer System Syntax) Tj
0 -16 Td
(D) Colorful Styling Software) Tj
0 -18 Td
(Answer: B) Tj
0 -16 Td
(Explanation: CSS stands for Cascading Style Sheets, used to style HTML elements.) Tj

0 -32 Td
(2. Which data structure uses First-In-First-Out FIFO order?) Tj
0 -18 Td
(A) Stack) Tj
0 -16 Td
(B) Binary Tree) Tj
0 -16 Td
(C) Queue) Tj
0 -16 Td
(D) Hash Map) Tj
0 -18 Td
(Answer: C) Tj
0 -16 Td
(Explanation: A Queue processes items in the exact order they arrive.) Tj

0 -32 Td
(3. What is the standard HTTP response code for a successful request?) Tj
0 -18 Td
(A) 200 OK) Tj
0 -16 Td
(B) 404 Not Found) Tj
0 -16 Td
(C) 500 Internal Error) Tj
0 -16 Td
(D) 301 Redirect) Tj
0 -18 Td
(Answer: A) Tj
0 -16 Td
(Explanation: HTTP 200 OK is the standard response for successful HTTP requests.) Tj
ET`;

        const streamLen = stream.length;
        const sampleText = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
4 0 obj << /Length ${streamLen} >>
stream
${stream}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000305 00000 n 
0000000222 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
1100
%%EOF`;

        const blob = new Blob([sampleText], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sample-mcq-quiz.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Sample PDF downloaded! Try uploading it now.');
    }

    // ==========================================================================
    // Utility Helpers
    // ==========================================================================
    function showToast(msg) {
        if (!elements.toast) return;
        elements.toastText.textContent = msg;
        elements.toast.classList.add('show');
        clearTimeout(elements.toast._timer);
        elements.toast._timer = setTimeout(() => {
            elements.toast.classList.remove('show');
        }, 3800);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Start on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
