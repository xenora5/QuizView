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
        let fenced = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            // Fenced code is opaque to question/answer detection, including A) and 1. lines.
            if (currentQuestion && (fenced || line.startsWith('```'))) {
                const value = lines[i];
                if (currentSection === 'option' && currentOptionKey) {
                    currentQuestion.options.find(o => o.key === currentOptionKey).text += '\n' + value;
                } else if (currentSection === 'explanation') {
                    currentQuestion.explanation += '\n' + value;
                } else {
                    currentQuestion.question += '\n' + value;
                }
                if (line.startsWith('```')) fenced = !fenced;
                continue;
            }
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
                fenced = currentQuestion.explanation.startsWith('```');
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
                    if (optText.includes('[x]') || optText.includes('(correct)') || line.trim().startsWith('*') || line.includes('✓')) {
                        isMarkedCorrect = true;
                        optText = optText.replace(/\[x\]|\(correct\)|✓/gi, '').trim();
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
                    fenced = optText.startsWith('```');
                    continue;
                }

                // If not an option start, it could be a continuation of current section
                if (currentSection === 'explanation') {
                    currentQuestion.explanation += (currentQuestion.explanation ? '\n' : '') + lines[i];
                } else if (currentSection === 'option' && currentOptionKey) {
                    // Check if line holds an inline answer before treating as option continuation
                    const inlineAns = line.match(this.answerRegex) || line.match(this.answerIsRegex);
                    if (inlineAns) {
                        currentQuestion.correctAnswer = inlineAns[1].toUpperCase();
                    } else {
                        // Append to current option
                        const opt = currentQuestion.options.find(o => o.key === currentOptionKey);
                        if (opt) {
                            opt.text += '\n' + lines[i];
                        }
                    }
                } else if (currentSection === 'question') {
                    // Continuation of question text (preserve line breaks for code)
                    currentQuestion.question += (currentQuestion.question ? '\n' : '') + lines[i];
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

            if (text.includes('[x]') || text.includes('(correct)')) {
                isMarkedCorrect = true;
                text = text.replace(/\[x\]|\(correct\)|✓/gi, '').trim();
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
        // Normalize question lines while preserving intentional line breaks for code
        if (q.question && !q.question.includes('```')) {
            const rawLines = q.question.split('\n');
            q.question = rawLines
                .map(l => l.trimEnd())
                .filter((l, idx, arr) => l.trim() || (idx > 0 && idx < arr.length - 1 && arr[idx - 1].trim()))
                .join('\n')
                .trim();
        }

        // Extract code snippet if present
        const codeAnalysis = this.extractQuestionAndCode(q.question);
        q.prompt = codeAnalysis.prompt;
        q.code = codeAnalysis.code;
        q.subPrompt = codeAnalysis.subPrompt;

        // Sort options A, B, C, D...
        q.options.sort((a, b) => a.key.localeCompare(b.key));

        // Clean option texts
        q.options.forEach(opt => {
            opt.text = opt.text.trim();
        });

        // Ensure explanation is cleaned
        if (q.explanation) {
            q.explanation = q.explanation.trim();
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
     * Splits a question string into prompt, code snippet, and optional sub-prompt.
     * Also formats code with clean indentation and newlines if it was extracted as a single line.
     * @param {string} rawText 
     * @returns {{ prompt: string, code: string|null, subPrompt: string|null }}
     */
    extractQuestionAndCode(rawText) {
        if (!rawText || typeof rawText !== 'string') {
            return { prompt: '', code: null, subPrompt: null };
        }

        const trimmed = rawText.trim();
        if (/\$|\\[([]/.test(trimmed)) return { prompt: trimmed, code: null, subPrompt: null };

        // 1. Check for Markdown code fences ```lang ... ```
        const fenceMatch = trimmed.match(/([\s\S]*?)```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)```([\s\S]*)/);
        if (fenceMatch) {
            const prompt = fenceMatch[1].trim();
            const code = fenceMatch[2].trim();
            const subPrompt = fenceMatch[3].trim() || null;
            return { prompt: prompt || 'Analyze the following code:', code, subPrompt };
        }

        // 2. Multi-line question with code segment
        if (trimmed.includes('\n')) {
            const lines = trimmed.split('\n');
            let firstCodeIdx = -1;
            let lastCodeIdx = -1;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (this.isCodeLine(line)) {
                    if (firstCodeIdx === -1) firstCodeIdx = i;
                    lastCodeIdx = i;
                } else if (firstCodeIdx !== -1) {
                    // Check if line continues a code block (e.g. closing brace, empty line, or comment)
                    if (line === '}' || line === '};' || line.startsWith('//') || line.startsWith('/*') || !line) {
                        lastCodeIdx = i;
                    }
                }
            }

            if (firstCodeIdx !== -1) {
                const promptLines = lines.slice(0, firstCodeIdx).map(l => l.trim()).filter(Boolean);
                const codeLines = lines.slice(firstCodeIdx, lastCodeIdx + 1);
                const subPromptLines = lines.slice(lastCodeIdx + 1).map(l => l.trim()).filter(Boolean);

                const prompt = promptLines.join(' ').trim();
                const code = codeLines.join('\n').trimEnd();
                const subPrompt = subPromptLines.length > 0 ? subPromptLines.join(' ').trim() : null;

                if (code.length > 0) {
                    return {
                        prompt: prompt || 'What is the output of the following code?',
                        code: code,
                        subPrompt: subPrompt
                    };
                }
            }
        }

        // 3. Single-line code detection:
        // Handles "What is the output of following code? int i = 0; for(int i = 0; i < n; i++){ cout<<arr[i]; }"
        const introRegex = /^(.*?(?:output\s+(?:of|from)\s+(?:the\s+)?following(?:\s+code|\s+snippet|\s+program)?|consider\s+(?:the\s+)?(?:following\s+)?code|what\s+will\s+(?:the\s+following|this)\s+(?:code|program|function)\s+(?:print|output|return)|given\s+the\s+(?:following\s+)?(?:code|function|snippet))[:?]?)\s+([a-zA-Z#_].*)/i;
        const introMatch = trimmed.match(introRegex);

        if (introMatch) {
            const promptCandidate = introMatch[1].trim();
            const restCandidate = introMatch[2].trim();

            if (this.hasCodeIndicators(restCandidate)) {
                const splitResult = this.splitTrailingQuestionFromCode(restCandidate);
                return {
                    prompt: promptCandidate,
                    code: this.formatCodeSnippet(splitResult.code),
                    subPrompt: splitResult.subPrompt
                };
            }
        }

        // 4. Code indicator check without explicit intro phrase
        // e.g. "int a = 5; int b = 10; cout << (a + b); What will be printed?"
        if (this.hasCodeIndicators(trimmed)) {
            const splitResult = this.splitTrailingQuestionFromCode(trimmed);
            if (splitResult.code && splitResult.subPrompt) {
                return {
                    prompt: 'Consider the following code:',
                    code: this.formatCodeSnippet(splitResult.code),
                    subPrompt: splitResult.subPrompt
                };
            }
        }

        return {
            prompt: trimmed.replace(/\s+/g, ' '),
            code: null,
            subPrompt: null
        };
    }

    /**
     * Checks if a single line resembles programming code
     */
    isCodeLine(line) {
        if (!line) return false;
        const trimmed = line.trim();

        // Common code line endings
        if (/[;{}]$/.test(trimmed)) return true;

        // Keywords at line start or statements
        if (/^(?:#include|import|from|using\s+namespace|def|class|struct|interface|enum|public|private|protected|static|void|int|float|double|char|bool|long|short|unsigned|const|let|var|auto|return|typedef)\b/.test(trimmed)) return true;

        // Control flow & loops
        if (/^(?:for|while|if|else\s+if|else|switch|case|catch|try|do)\b/.test(trimmed)) return true;

        // Standard I/O or methods
        if (/(?:cout\s*<<|cin\s*>>|printf\s*\(|scanf\s*\(|System\.out\.|console\.log|print\s*\(|\.append\(|\.push\()/.test(trimmed)) return true;

        // Code syntax operators
        if (/(?:->|::|<<|>>|\+\+|--|==|!=|\+=|-=|\*=|\/=|&&|\|\|)/.test(trimmed)) return true;

        // Single closing or opening braces/parentheses
        if (/^[{}()\[\];,]+$/.test(trimmed)) return true;

        return false;
    }

    /**
     * Checks if a string contains code indicators
     */
    hasCodeIndicators(str) {
        if (!str) return false;
        const semicolonCount = (str.match(/;/g) || []).length;
        const braceCount = (str.match(/[{}]/g) || []).length;
        const keywordMatch = /(?:#include|def\s+\w+|for\s*\(|while\s*\(|cout\s*<<|cin\s*>>|printf\s*\(|System\.out|console\.log|int\s+\w+|float\s+\w+|char\s+\w+|return\b)/.test(str);

        return (semicolonCount >= 1 && (braceCount >= 1 || keywordMatch)) || 
               (keywordMatch && (semicolonCount >= 1 || braceCount >= 1)) ||
               (semicolonCount >= 2);
    }

    /**
     * Formats code with proper newlines and indentation.
     * Especially useful when code from PDF is squished into one line.
     */
    formatCodeSnippet(rawCode) {
        if (!rawCode) return '';
        const trimmed = rawCode.trim();

        // If it already contains multiple lines, normalize indentation
        if (trimmed.includes('\n')) {
            const lines = trimmed.split('\n');
            return lines.map(l => l.trimEnd()).join('\n');
        }

        // Single-line code: insert newlines after semicolons and braces
        let formatted = '';
        let inParen = 0;
        let indentLevel = 0;
        const getIndent = () => '    '.repeat(Math.max(0, indentLevel));

        for (let i = 0; i < trimmed.length; i++) {
            const ch = trimmed[i];

            if (ch === '(') inParen++;
            else if (ch === ')') inParen = Math.max(0, inParen - 1);

            if (ch === '{') {
                indentLevel++;
                formatted += ' {\n' + getIndent();
                while (trimmed[i + 1] === ' ') i++;
                continue;
            } else if (ch === '}') {
                indentLevel = Math.max(0, indentLevel - 1);
                formatted += '\n' + getIndent() + '}';
                if (trimmed[i + 1] && trimmed[i + 1] !== ';') {
                    formatted += '\n' + getIndent();
                }
                while (trimmed[i + 1] === ' ') i++;
                continue;
            } else if (ch === ';' && inParen === 0) {
                formatted += ';\n' + getIndent();
                while (trimmed[i + 1] === ' ') i++;
                continue;
            }

            formatted += ch;
        }

        return formatted.trim();
    }

    /**
     * Detects if a code block is followed by a question prompt
     */
    splitTrailingQuestionFromCode(str) {
        const trailingQMatch = str.match(/(.*?)(?:(?:\}\s*|\;\s*)(What\s+.*|Find\s+.*|Which\s+.*|The\s+output\s+.*|\?\s*))$/i);
        if (trailingQMatch) {
            return {
                code: trailingQMatch[1].trim(),
                subPrompt: trailingQMatch[2].trim()
            };
        }
        return {
            code: str,
            subPrompt: null
        };
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
                prompt: q.prompt || q.question,
                code: q.code || null,
                subPrompt: q.subPrompt || null,
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
