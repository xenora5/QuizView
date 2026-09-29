/**
 * QuizView - Intelligent PDF MCQ Parser
 * Robust extraction of questions, options, answers, and explanations from PDF text
 */

class MCQParser {
    constructor() {
        // Common regex patterns for question headers (e.g. "1.", "1)", "Q1.", "Question 1:", "(1)")
        this.questionRegex = /^(?:(?:Question|Que|Q)\s*[-.:#]?\s*(\d+)?|(\d+)\s*[.):\-]|\((\d+)\))\s*(.*)/i;
        
        // Option starting indicators e.g. "A.", "A)", "(A)", "[A]", "A -", "A:", "a.", "a)", "*A)", "✓B)"
        this.optionRegex = /^[*✓•\-\s]*[(\[]?([A-F])[.)\]\-:]\s*(.*)/i;

        // Inline multiple options pattern on a single line
        // e.g. "A) Alpha   B) Beta   C) Gamma   D) Delta" or "(A) Dog (B) Cat"
        this.inlineOptionDivider = /(?:^|\s{2,}|\t+)[(\[]?([A-F])[.)\]\-:]\s+/gi;

        // Answer indicators e.g. "Answer: B", "Ans: (C)", "Key: D", "Correct Option: A", "Ans. B"
        this.answerRegex = /(?:(?:Correct\s*)?(?:Ans(?:wer)?|Option|Choice|Key)|Solution)\s*(?:is|should\s+be)?\s*[:=\-–—.]?\s*\(?([A-F])\)?/i;
        this.answerIsRegex = /(?:Option|Choice)\s*\(?([A-F])\)?\s*(?:is\s+(?:the\s+)?correct)/i;

        // Explanation indicators e.g. "Explanation: ...", "Exp: ...", "Rationale: ..."
        this.explanationRegex = /^(?:Explanation|Exp|Rationale|Solution|Reason|Note)\s*[:=\-–—.]?\s*(.*)/i;

        // Header / footer noise filter patterns (page numbers, headers)
        this.noiseRegex = /^(?:page\s+\d+(?:\s+of\s+\d+)?|\d+\s*\/\s*\d+|copyright.*|all rights reserved.*)$/i;
    }

    /**
     * Parses raw text extracted from PDF into an array of MCQ objects.
     * @param {string} fullText Raw concatenated text of the PDF
     * @returns {Array<Object>} List of parsed MCQs
     */
    parse(fullText) {
        if (!fullText || typeof fullText !== 'string') return [];

        // Normalize line breaks & tabs
        const normalized = fullText
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\u00A0/g, ' '); // Non-breaking space

        // Step 1: Check for an Answer Key section at the end/beginning
        const answerKeyMap = this.extractAnswerKeySection(normalized);

        // Step 2: Line by line state machine extraction
        const lines = normalized.split('\n');
        const rawQuestions = [];
        let currentQuestion = null;
        let currentSection = null; // 'question', 'option', 'explanation'
        let currentOptionKey = null;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line || this.noiseRegex.test(line)) continue;

            // Check if this line marks the start of the Answer Key section
            if (this.isAnswerKeyHeader(line)) {
                // If we reach the Answer Key section, wrap up current question
                if (currentQuestion) {
                    this.finalizeQuestion(currentQuestion);
                    rawQuestions.push(currentQuestion);
                    currentQuestion = null;
                }
                break; // Answer key has already been extracted or will be handled
            }

            // Check if line is an Explanation line
            const expMatch = line.match(this.explanationRegex);
            if (expMatch && currentQuestion) {
                currentSection = 'explanation';
                currentQuestion.explanation = expMatch[1].trim();
                continue;
            }

            // Check if line is an inline Answer line (e.g. "Answer: B" or "Ans: (C)")
            const ansMatch = line.match(this.answerRegex) || line.match(this.answerIsRegex);
            if (ansMatch && currentQuestion) {
                currentQuestion.correctAnswer = ansMatch[1].toUpperCase();
                // If there's text after answer, it might be an explanation
                const afterAns = line.replace(this.answerRegex, '').replace(this.answerIsRegex, '').trim();
                if (afterAns && afterAns.length > 5 && !currentQuestion.explanation) {
                    currentQuestion.explanation = afterAns.replace(/^[;,\-–—]\s*/, '');
                }
                continue;
            }

            // Check if line starts a NEW question
            const qMatch = line.match(this.questionRegex);
            // Verify it's a real question header (and not an option like A. or B.)
            const isOptionStart = this.optionRegex.test(line);

            if (qMatch && !isOptionStart) {
                const qNum = parseInt(qMatch[1] || qMatch[2] || qMatch[3], 10);
                let qBody = qMatch[4] ? qMatch[4].trim() : '';
                // Strip leading delimiters like ". ", ": ", "- "
                qBody = qBody.replace(/^[.:\-–—)]\s*/, '').trim();

                // Close previous question if exists
                if (currentQuestion) {
                    this.finalizeQuestion(currentQuestion);
                    rawQuestions.push(currentQuestion);
                }

                currentQuestion = {
                    number: qNum || (rawQuestions.length + 1),
                    question: qBody,
                    options: [],
                    correctAnswer: null,
                    explanation: ''
                };
                currentSection = 'question';
                currentOptionKey = null;
                continue;
            }

            // If we are inside a question, check for options
            if (currentQuestion) {
                // Check if line contains multiple options side-by-side
                const inlineMatches = this.parseInlineOptions(line);
                if (inlineMatches && inlineMatches.length >= 2) {
                    currentSection = 'option';
                    inlineMatches.forEach(opt => {
                        this.addOptionToQuestion(currentQuestion, opt.key, opt.text);
                        if (opt.isMarkedCorrect) {
                            currentQuestion.correctAnswer = opt.key;
                        }
                    });
                    continue;
                }

                // Check for single option start (e.g., "A) London")
                const optMatch = line.match(this.optionRegex);
                if (optMatch) {
                    currentSection = 'option';
                    const optKey = optMatch[1].toUpperCase();
                    let optText = optMatch[2].trim();

                    // Check if option line contains answer marker (e.g. "A) Paris [Correct]" or "*A) Paris")
                    let isMarkedCorrect = false;
                    if (optText.includes('[x]') || optText.includes('(correct)') || optText.includes('*') || line.trim().startsWith('*') || line.includes('✓')) {
                        isMarkedCorrect = true;
                        optText = optText.replace(/\[x\]|\(correct\)|✓|\*/gi, '').trim();
                    }

                    // Also check if Answer: X is at the end of option line
                    const inlineAns = optText.match(this.answerRegex);
                    if (inlineAns) {
                        currentQuestion.correctAnswer = inlineAns[1].toUpperCase();
                        optText = optText.replace(this.answerRegex, '').trim();
                    }

                    this.addOptionToQuestion(currentQuestion, optKey, optText);
                    if (isMarkedCorrect) {
                        currentQuestion.correctAnswer = optKey;
                    }
                    currentOptionKey = optKey;
                    continue;
                }

                // If not an option start, it could be a continuation of current section
                if (currentSection === 'explanation') {
                    currentQuestion.explanation += (currentQuestion.explanation ? ' ' : '') + line;
                } else if (currentSection === 'option' && currentOptionKey) {
                    // Check if line holds an inline answer before treating as option continuation
                    const inlineAns = line.match(this.answerRegex) || line.match(this.answerIsRegex);
                    if (inlineAns) {
                        currentQuestion.correctAnswer = inlineAns[1].toUpperCase();
                    } else {
                        // Append to current option
                        const opt = currentQuestion.options.find(o => o.key === currentOptionKey);
                        if (opt) {
                            opt.text += ' ' + line;
                        }
                    }
                } else if (currentSection === 'question') {
                    // Continuation of question text
                    currentQuestion.question += (currentQuestion.question ? ' ' : '') + line;
                }
            }
        }

        // Finalize last question
        if (currentQuestion) {
            this.finalizeQuestion(currentQuestion);
            rawQuestions.push(currentQuestion);
        }

        // Apply external Answer Key map if individual questions lacked answers
        rawQuestions.forEach((q, idx) => {
            const keyNum = q.number || (idx + 1);
            if (!q.correctAnswer && answerKeyMap[keyNum]) {
                q.correctAnswer = answerKeyMap[keyNum];
            }
        });

        // Filter and sanitize valid MCQs (must have at least 2 options and a non-empty question)
        return this.cleanAndValidateMCQs(rawQuestions);
    }

    /**
     * Parse a line that contains multiple options side by side
     * e.g. "A) Hydrogen   B) Helium   C) Oxygen   D) Nitrogen"
     */
    parseInlineOptions(line) {
        const regex = /(?:^|\s{2,}|\t+)[(\[]?([A-F])[.)\]\-:]\s+(.*?)(?=(?:\s{2,}|\t+)[(\[]?[A-F][.)\]\-:]|$)/gi;
        const matches = [];
        let match;

        while ((match = regex.exec(line)) !== null) {
            let key = match[1].toUpperCase();
            let text = match[2].trim();
            let isMarkedCorrect = false;

            if (text.includes('[x]') || text.includes('(correct)') || text.includes('*')) {
                isMarkedCorrect = true;
                text = text.replace(/\[x\]|\(correct\)|✓|\*/gi, '').trim();
            }

            matches.push({ key, text, isMarkedCorrect });
        }

        // Only return if we found at least 2 options
        return matches.length >= 2 ? matches : null;
    }

    /**
     * Safely adds or updates an option for a question
     */
    addOptionToQuestion(question, key, text) {
        const existing = question.options.find(o => o.key === key);
        if (existing) {
            existing.text = text;
        } else {
            question.options.push({ key: key.toUpperCase(), text: text });
        }
    }

    /**
     * Checks if line signals the start of an Answer Key section
     */
    isAnswerKeyHeader(line) {
        return /^(?:Answer\s*Key|Answers|Solutions|Answer\s*Sheet)\b/i.test(line);
    }

    /**
     * Extracts an answer key block from text
     * Handles formats like:
     * "Answer Key: 1. A, 2. C, 3. D" or "1: A\n2: B" or "1 - A  2 - C"
     */
    extractAnswerKeySection(text) {
        const map = {};
        const keyIndex = text.search(/(?:Answer\s*Key|Answers|Solutions)\b/i);
        if (keyIndex === -1) return map;

        const keyText = text.slice(keyIndex);
        const pairRegex = /(?:Q(?:uestion)?\.?\s*)?(\d+)\s*[:.\-–—)]\s*\(?([A-F])\)?/gi;
        let match;

        while ((match = pairRegex.exec(keyText)) !== null) {
            const num = parseInt(match[1], 10);
            const ans = match[2].toUpperCase();
            if (num && ans) {
                map[num] = ans;
            }
        }
        return map;
    }

    /**
     * Finalizes and cleans up a question object before adding
     */
    finalizeQuestion(q) {
        // Clean question text
        q.question = q.question.replace(/\s+/g, ' ').trim();

        // Sort options A, B, C, D...
        q.options.sort((a, b) => a.key.localeCompare(b.key));

        // Clean option texts
        q.options.forEach(opt => {
            opt.text = opt.text.replace(/\s+/g, ' ').trim();
        });

        // Ensure explanation is cleaned
        if (q.explanation) {
            q.explanation = q.explanation.replace(/\s+/g, ' ').trim();
        }

        // If no explanation is found, generate an intuitive default explanation
        if (!q.explanation && q.correctAnswer) {
            const correctOpt = q.options.find(o => o.key === q.correctAnswer);
            if (correctOpt) {
                q.explanation = `Option ${q.correctAnswer} ("${correctOpt.text}") is the correct answer.`;
            } else {
                q.explanation = `Option ${q.correctAnswer} is the verified correct answer for this question.`;
            }
        }
    }

    /**
     * Validates and cleans MCQs, handling missing answers gracefully
     */
    cleanAndValidateMCQs(rawList) {
        const valid = [];

        rawList.forEach((q, idx) => {
            // Must have question text and at least 2 options
            if (!q.question || q.question.length < 3) return;
            if (!q.options || q.options.length < 2) return;

            // If no correct answer was detected anywhere in PDF:
            // Default to 'A' or first option so the quiz is playable, and mark flag for user review
            let answerAutoAssigned = false;
            if (!q.correctAnswer) {
                q.correctAnswer = q.options[0].key;
                answerAutoAssigned = true;
                if (!q.explanation) {
                    q.explanation = `Option ${q.correctAnswer} is selected as the answer (verify in Question Editor if needed).`;
                }
            }

            valid.push({
                id: idx + 1,
                number: q.number || (idx + 1),
                question: q.question,
                options: q.options,
                correctAnswer: q.correctAnswer.toUpperCase(),
                explanation: q.explanation || `Option ${q.correctAnswer} is the correct choice.`,
                answerAutoAssigned
            });
        });

        return valid;
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.MCQParser = MCQParser;
}
