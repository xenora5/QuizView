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
    let revealFrame = null;
    let editorOpener = null;
    const scrollBehavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

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
        questionCodeCard: document.getElementById('questionCodeCard'),
        questionCodeContent: document.getElementById('questionCodeContent'),
        questionSubPrompt: document.getElementById('questionSubPrompt'),
        copyCodeBtn: document.getElementById('copyCodeBtn'),
        copyCodeText: document.getElementById('copyCodeText'),
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
        document.getElementById('backToQuestionBtn').addEventListener('click', () => {
            elements.questionText.focus({ preventScroll: true });
            elements.questionText.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
        });
        const resume = document.getElementById('resumeQuizBtn');
        try {
            const saved = JSON.parse(localStorage.getItem('quizview.questions') || 'null');
            if (Array.isArray(saved) && saved.length && saved.every(q => typeof q.question === 'string' &&
                typeof q.correctAnswer === 'string' && Array.isArray(q.options) && q.options.length >= 2 &&
                q.options.every(o => typeof o.key === 'string' && typeof o.text === 'string'))) {
                resume.hidden = false;
                resume.addEventListener('click', () => { startQuizWithQuestions(saved); resume.hidden = true; });
            }
        } catch (_) { /* Browser storage may be disabled. The quiz still works. */ }

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

        // Copy code button handler
        if (elements.copyCodeBtn) {
            elements.copyCodeBtn.addEventListener('click', () => {
                const codeToCopy = elements.questionCodeContent ? elements.questionCodeContent.textContent : '';
                if (!codeToCopy) return;

                const onCopied = () => {
                    elements.copyCodeText.textContent = 'Copied! ✓';
                    setTimeout(() => {
                        elements.copyCodeText.textContent = 'Copy';
                    }, 2000);
                };

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(codeToCopy).then(onCopied).catch(() => {
                        fallbackCopy(codeToCopy, onCopied);
                    });
                } else {
                    fallbackCopy(codeToCopy, onCopied);
                }
            });
        }
    }

    function fallbackCopy(text, callback) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            if (callback) callback();
        } catch (e) {
            console.error('Copy failed', e);
        }
        document.body.removeChild(ta);
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
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
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
        cancelAnimationFrame(revealFrame);
        document.getElementById('answerFeedback').textContent = '';

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
            pills[currentQuestionIndex].scrollIntoView({ behavior: scrollBehavior(), inline: 'center', block: 'nearest' });
        }

        // Render question text & separate code segment if present
        const analysis = QuizContent.isExplicit(q.question)
            ? { prompt: q.question, code: null, subPrompt: null }
            : parser.extractQuestionAndCode(q.question);
        const promptText = QuizContent.isExplicit(q.question) ? q.question : (q.prompt || analysis.prompt || q.question);
        const codeText = QuizContent.isExplicit(q.question) ? null : (q.code !== undefined && q.code !== null ? q.code : analysis.code);
        const subPromptText = QuizContent.isExplicit(q.question) ? null : (q.subPrompt !== undefined && q.subPrompt !== null ? q.subPrompt : analysis.subPrompt);

        QuizContent.render(elements.questionText, `${q.number || qNum}. ${promptText}`);

        if (codeText && elements.questionCodeCard && elements.questionCodeContent) {
            elements.questionCodeCard.style.display = 'block';
            elements.questionCodeContent.textContent = codeText;
            if (elements.copyCodeText) elements.copyCodeText.textContent = 'Copy';
        } else if (elements.questionCodeCard) {
            elements.questionCodeCard.style.display = 'none';
            if (elements.questionCodeContent) elements.questionCodeContent.textContent = '';
        }

        if (subPromptText && elements.questionSubPrompt) {
            elements.questionSubPrompt.style.display = 'block';
            QuizContent.render(elements.questionSubPrompt, subPromptText);
        } else if (elements.questionSubPrompt) {
            elements.questionSubPrompt.style.display = 'none';
            elements.questionSubPrompt.textContent = '';
        }

        // Render Options
        renderOptions(q, state);

        // Render Explanation
        if (state.solved) {
            elements.explanationBox.classList.add('visible');
            QuizContent.render(elements.explanationContent, q.explanation || `Option ${q.correctAnswer} is the correct answer.`);
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
                <span class="option-key">${escapeHtml(opt.key)}</span>
                <span class="option-text"></span>
                <span class="option-status-icon" aria-hidden="true">
                    ${isCorrect ? '✓' : '✕'}
                </span>
            `;

            QuizContent.render(btn.querySelector('.option-text'), opt.text);
            btn.setAttribute('aria-disabled', String(isAlreadySolved));

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
            document.getElementById('answerFeedback').textContent = `Option ${selectedKey} is incorrect. Try again.`;
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
            btn.setAttribute('aria-disabled', 'true');
            if (btn !== clickedBtn) {
                btn.classList.add('option-dimmed');
            }
        });

        // Reveal 1-2 line explanation smoothly
        elements.explanationBox.classList.add('visible');
        QuizContent.render(elements.explanationContent, q.explanation || `Option ${q.correctAnswer} is the verified correct answer.`);
        document.getElementById('answerFeedback').textContent = `Correct. Option ${selectedKey}. Explanation is now available below.`;
        // Only a new correct answer triggers this, never a re-render or a revisit.
        cancelAnimationFrame(revealFrame);
        revealFrame = requestAnimationFrame(() => {
            const box = elements.explanationBox.getBoundingClientRect();
            const headerBottom = document.querySelector('.app-header').getBoundingClientRect().bottom;
            if (box.top < headerBottom || box.bottom > window.innerHeight - 96) {
                elements.explanationBox.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
            }
        });

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
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.closest('.rich-code-viewport') || elements.editorModal.classList.contains('active')) {
                return;
            }

            if (document.activeElement.tagName === 'BUTTON' && ['Enter', ' '].includes(e.key)) return;

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

            const analysis = QuizContent.isExplicit(q.question)
            ? { prompt: q.question, code: null, subPrompt: null }
            : parser.extractQuestionAndCode(q.question);
            const promptText = QuizContent.isExplicit(q.question) ? q.question : (q.prompt || analysis.prompt || q.question);
            const codeText = QuizContent.isExplicit(q.question) ? null : (q.code !== undefined && q.code !== null ? q.code : analysis.code);
            const subPromptText = QuizContent.isExplicit(q.question) ? null : (q.subPrompt !== undefined && q.subPrompt !== null ? q.subPrompt : analysis.subPrompt);

            let codeSnippetHtml = '';
            if (codeText) {
                codeSnippetHtml = `<div class="review-code-block"><pre><code>${escapeHtml(codeText)}</code></pre></div>`;
            }
            let subPromptHtml = '';
            if (subPromptText) {
                subPromptHtml = `<div class="review-q-subprompt">${escapeHtml(subPromptText)}</div>`;
            }

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                    <div class="review-q-title">Q${idx + 1}. ${escapeHtml(promptText)}</div>
                    <div>${statusBadge}</div>
                </div>
                ${codeSnippetHtml}
                ${subPromptHtml}
                <div class="review-ans-row">
                    <strong>Correct Option (${escapeHtml(q.correctAnswer)}):</strong> ${escapeHtml(correctText)}
                </div>
                ${q.explanation ? `<div class="review-exp-row"><strong>Explanation:</strong> ${escapeHtml(q.explanation)}</div>` : ''}
            `;

            QuizContent.render(item.querySelector('.review-q-title'), `Q${idx + 1}. ${promptText}`);
            if (subPromptText) QuizContent.render(item.querySelector('.review-q-subprompt'), subPromptText);
            QuizContent.render(item.querySelector('.review-ans-row'), `Correct Option (${q.correctAnswer}): ${correctText}`);
            if (q.explanation) QuizContent.render(item.querySelector('.review-exp-row'), `Explanation: ${q.explanation}`);
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
        document.getElementById('cancelEditorBtn').addEventListener('click', closeEditorModal);
        elements.editorModal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') { event.preventDefault(); closeEditorModal(); }
            if (event.key !== 'Tab') return;
            const controls = [...elements.editorModal.querySelectorAll('button, input, textarea')].filter(el => !el.disabled);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
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
        editorOpener = document.activeElement;
        elements.editorModal.classList.add('active');
        document.querySelector('main').inert = true;
        document.querySelector('header').inert = true;
        document.body.style.overflow = 'hidden';
        elements.closeEditorBtn.focus();
    }

    function closeEditorModal() {
        elements.editorModal.classList.remove('active');
        document.querySelector('main').inert = false;
        document.querySelector('header').inert = false;
        document.body.style.overflow = '';
        editorOpener?.focus();
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
                        <textarea aria-label="Option ${opt.key}" class="editor-input opt-text-input" data-key="${opt.key}" placeholder="Option text">${escapeHtml(opt.text)}</textarea>
                    </div>
                `;
            });

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="editor-label">Question ${idx + 1}</span>
                    <button class="btn btn-ghost btn-sm delete-q-btn" style="color:#ef4444;" title="Delete this question">Delete</button>
                </div>
                <textarea aria-label="Question content" class="editor-textarea q-text-input" placeholder="Question prompt">${escapeHtml(q.question)}</textarea>
                <div class="editor-label" style="margin-top:0.4rem;">Options (select radio for correct answer)</div>
                <div class="editor-options-box">${optionsHtml}</div>
                <div class="editor-label" style="margin-top:0.4rem;">Explanation</div>
                <textarea aria-label="Explanation" class="editor-input q-exp-input" placeholder="Explanation shown when answered correctly">${escapeHtml(q.explanation || '')}</textarea>
            `;

            card.querySelector('.delete-q-btn').addEventListener('click', () => {
                card.remove();
            });

            elements.editorContainer.appendChild(card);
        });
    }

    function addNewQuestionInEditor() {
        const newIndex = Math.max(-1, ...[...elements.editorContainer.querySelectorAll('.editor-card')].map(c => Number(c.dataset.index))) + 1;
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
                    <textarea aria-label="Option ${opt.key}" class="editor-input opt-text-input" data-key="${opt.key}" placeholder="Option text">${escapeHtml(opt.text)}</textarea>
                </div>
            `;
        });

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="editor-label">Question ${newIndex + 1} (New)</span>
                <button class="btn btn-ghost btn-sm delete-q-btn" style="color:#ef4444;" title="Delete this question">Delete</button>
            </div>
            <textarea aria-label="Question content" class="editor-textarea q-text-input" placeholder="Question prompt">New Question prompt here</textarea>
            <div class="editor-label" style="margin-top:0.4rem;">Options (select radio for correct answer)</div>
            <div class="editor-options-box">${optionsHtml}</div>
            <div class="editor-label" style="margin-top:0.4rem;">Explanation</div>
            <textarea aria-label="Explanation" class="editor-input q-exp-input" placeholder="Explanation shown when answered correctly">Option A is the correct answer.</textarea>
        `;

        card.querySelector('.delete-q-btn').addEventListener('click', () => {
            card.remove();
        });

        elements.editorContainer.appendChild(card);
        card.scrollIntoView({ behavior: scrollBehavior() });
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
                const analysis = parser.extractQuestionAndCode(qText);
                updatedList.push({
                    id: idx + 1,
                    number: idx + 1,
                    question: qText,
                    prompt: analysis.prompt || qText,
                    code: analysis.code,
                    subPrompt: analysis.subPrompt,
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
        try {
            localStorage.setItem('quizview.questions', JSON.stringify(updatedList));
            showToast('Quiz saved in this browser.');
        } catch (_) { showToast('Changes applied. Browser storage is unavailable; keep this tab open.'); }
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
ET`.replace(/^\((.*)\) Tj$/gm, (_, text) =>
            `(${text.replace(/[\\()]/g, '\\$&')}) Tj`);

        // Compute byte offsets instead of relying on hard-coded xref positions.
        const objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
        ];
        let sampleText = '%PDF-1.4\n';
        const offsets = [0];
        objects.forEach((object, index) => {
            offsets.push(new TextEncoder().encode(sampleText).length);
            sampleText += `${index + 1} 0 obj\n${object}\nendobj\n`;
        });
        const xref = new TextEncoder().encode(sampleText).length;
        sampleText += 'xref\n0 6\n0000000000 65535 f \n';
        sampleText += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
        sampleText += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

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
