# 📝 QuizView — PDF Multiple-Choice Quiz Interface

QuizView is a responsive, client-side web application built with **HTML5, CSS3, JavaScript, and PDF.js** that converts multiple-choice question (MCQ) PDFs into an interactive practice quiz with a sleek modern dark theme.

Hosted directly on **GitHub Pages** with zero backend or build configuration required.

![QuizView Dark Quiz Interface](https://raw.githubusercontent.com/placeholder/quizview/main/preview.png)

---

## ✨ Features

- **📄 Automatic PDF MCQ Extraction**: Drag and drop any PDF containing multiple-choice questions. Uses Mozilla's [PDF.js](https://mozilla.github.io/pdf.js/) and layout-aware text sorting to accurately extract questions, options, answer keys, and explanations.
- **🔄 Repeatable Option Guessing**:
  - Wrong choices turn **red temporarily** with an intuitive shake animation, allowing you to retry immediately without penalty or lockouts.
  - The correct choice turns **emerald green** with a checkmark and celebration glow.
- **💡 Instant 1–2 Line Explanations**: Once the correct option is found, an explanation card slides smoothly into view beneath the options.
- **📊 Real-time Progress & Counter**:
  - Dynamic "Question X of Y" counter and smooth progress bar.
  - Interactive Question Jump Strip (Pills) displaying answered, attempted, and active questions.
  - Live Solved & Accuracy counter.
- **🏆 Comprehensive Results Screen**:
  - Animated SVG circular score indicator.
  - Detailed breakdown of all questions, answers, and explanations.
  - "Retry Missed Questions" and "Restart Quiz" options.
- **🛠️ In-App Question Editor**: Review, edit, or customize any extracted question, option, answer key, or explanation on the fly.
- **⚡ Built-in Demo & Sample PDF Generator**: Test the app immediately using the pre-loaded 5-question demo or generate and download a sample PDF with one click.
- **📱 Responsive & Dark-Themed**: Designed with a high-contrast dark aesthetic, glassmorphic surfaces, accessible font scales, and keyboard shortcuts (`A`–`D` or `1`–`4` to pick options, `→` or `Enter` for Next).

---

## 🚀 Live Demo & GitHub Pages Deployment

### Deploying to GitHub Pages (2 Steps)

1. **Push this repository to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial QuizView commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository on GitHub.
   - Navigate to **Settings** > **Pages** (under the "Code and automation" sidebar).
   - Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
   - Select **Branch**: `main`, folder: `/(root)`, and click **Save**.
   - Your web app will be live within seconds at:
     `https://<your-username>.github.io/<your-repo-name>/`

---

## 💻 Running Locally

No npm, Node.js, Python, or build steps required. Simply open `index.html` in any modern web browser:

- Double-click `index.html` to open it locally.
- Or serve it using any local static web server if desired:
  ```bash
  # Python 3
  python -m http.server 8000

  # Node.js
  npx serve .
  ```

---

## 📑 Supported PDF MCQ Formats

QuizView's extraction engine supports all common textbook, test bank, and exam formats:

### Standard Numbered Questions:
```text
1. What does CSS stand for in web design?
A) Creative Style Sheets
B) Cascading Style Sheets
C) Computer System Syntax
D) Colorful Styling Software
Answer: B
Explanation: CSS stands for Cascading Style Sheets.
```

### Inline Multiple Options:
```text
Q2. Which element has the chemical symbol 'O'?
(A) Gold   (B) Oxygen   (C) Osmium   (D) Silver
Ans: B
```

### End-of-Document Answer Key:
If individual questions don't include an `Answer:` line, QuizView will automatically look for an **Answer Key** section at the end of the document:
```text
ANSWER KEY:
1: B
2: C
3: A
```

### Questions Without Answers:
If a PDF lacks answers completely, QuizView allows you to practice freely and provides a **"Review & Edit Questions"** modal to set or adjust answers anytime.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `A` / `B` / `C` / `D` or `1` / `2` / `3` / `4` | Select option |
| `→` (Right Arrow) or `Enter` | Next Question |
| `←` (Left Arrow) | Previous Question |

---

## 📂 Project Architecture

```
QuizView/
├── index.html        # Clean semantic markup with dark theme layout & modals
├── style.css         # Modern dark theme styles, micro-animations & responsive CSS
├── app.js            # Main application logic, PDF loading, and state management
├── parser.js         # Modular, heuristic MCQ text extraction engine
├── sample-data.js    # Built-in demo questions for immediate preview
├── sample-quiz.pdf   # Pre-generated sample PDF file
└── README.md         # Documentation & GitHub Pages guide
```

---

## 🛡️ License

MIT License. Open source and free for personal and educational use.
