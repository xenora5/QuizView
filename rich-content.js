/** Safe, deliberately small rich-content renderer. Raw HTML is always literal text. */
(function () {
    'use strict';
    function codeBlock(source, language = '') {
        const block = document.createElement('span');
        block.className = 'rich-code-block';
        const label = document.createElement('span');
        label.className = 'rich-code-label';
        label.textContent = language || 'Code';
        const pre = document.createElement('span');
        pre.className = 'rich-code-viewport';
        pre.tabIndex = 0;
        pre.setAttribute('role', 'region');
        pre.setAttribute('aria-label', `${language || 'Code'} snippet; scroll horizontally if needed`);
        const code = document.createElement('code');
        code.textContent = source;
        pre.append(code);
        block.append(label, pre);
        return block;
    }

    function inline(target, text) {
        // Code is tokenized before math, so dollars/backslashes in code stay literal.
        const tokens = /(`+)([^`\n]*?)\1|(?<!\\)(\$\$)([\s\S]+?)\3|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$])\$(?!\s)([^$\n]*?\S)\$(?!\d)/g;
        let cursor = 0;
        for (const match of text.matchAll(tokens)) {
            target.append(document.createTextNode(text.slice(cursor, match.index)));
            if (match[1]) {
                const code = document.createElement('code');
                code.className = 'rich-inline-code';
                code.textContent = match[2];
                target.append(code);
            } else {
                const source = match[4] ?? match[5] ?? match[6] ?? match[7];
                const display = Boolean(match[3] || match[5]);
                const math = document.createElement('span');
                math.className = display ? 'rich-math rich-math-display' : 'rich-math';
                try {
                    if (!window.katex) throw new Error('Math renderer unavailable');
                    window.katex.render(source, math, {
                        displayMode: display, throwOnError: true, trust: false,
                        strict: 'error', maxSize: 10, maxExpand: 1000, output: 'htmlAndMathml'
                    });
                } catch (_) {
                    math.classList.add('math-fallback');
                    math.textContent = match[0];
                    math.title = 'Math could not be rendered; original notation is shown.';
                }
                target.append(math);
            }
            cursor = match.index + match[0].length;
        }
        target.append(document.createTextNode(text.slice(cursor)));
    }

    function render(target, value) {
        const text = String(value ?? '').replace(/\r\n?/g, '\n');
        target.replaceChildren();
        target.classList.add('rich-content');
        const fences = /^[ \t]*```([^\n`]*)\n([\s\S]*?)^[ \t]*```[ \t]*(?=\n|$)/gm;
        let cursor = 0;
        for (const match of text.matchAll(fences)) {
            inline(target, text.slice(cursor, match.index));
            target.append(codeBlock(match[2].replace(/\n$/, ''), match[1].trim()));
            cursor = match.index + match[0].length;
        }
        inline(target, text.slice(cursor));
        if (target.closest('button')) {
            target.querySelectorAll('[tabindex]').forEach(node => node.removeAttribute('tabindex'));
        }
    }
    function isExplicit(text) {
        // Do not let legacy C++ heuristics interpret LaTeX braces as code.
        return /```|\$|\\[([]/.test(text || '');
    }
    window.QuizContent = { render, codeBlock, isExplicit };
})();
