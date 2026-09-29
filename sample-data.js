/**
 * Sample MCQ Data for immediate testing without uploading a PDF
 */

window.SAMPLE_QUIZ = [
    {
        id: 1,
        number: 1,
        question: "Which of the following is the primary role of the CSS 'box-sizing: border-box' declaration?",
        options: [
            { key: "A", text: "It hides the borders of child elements automatically." },
            { key: "B", text: "It includes padding and border within the element's total width and height." },
            { key: "C", text: "It converts an inline element into a block-level container." },
            { key: "D", text: "It prevents content from overflowing the viewport boundaries." }
        ],
        correctAnswer: "B",
        explanation: "By default (content-box), padding and border add to the element's width. With border-box, padding and border are included in the specified width and height."
    },
    {
        id: 2,
        number: 2,
        question: "In JavaScript, what will the expression `typeof NaN` evaluate to?",
        options: [
            { key: "A", text: "'undefined'" },
            { key: "B", text: "'null'" },
            { key: "C", text: "'number'" },
            { key: "D", text: "'NaN'" }
        ],
        correctAnswer: "C",
        explanation: "Although 'NaN' stands for 'Not-a-Number', its technical ECMAScript type is numeric, so typeof NaN returns 'number'."
    },
    {
        id: 3,
        number: 3,
        question: "Which HTTP status code signifies that a requested resource was successfully created on the server?",
        options: [
            { key: "A", text: "200 OK" },
            { key: "B", text: "201 Created" },
            { key: "C", text: "204 No Content" },
            { key: "D", text: "304 Not Modified" }
        ],
        correctAnswer: "B",
        explanation: "HTTP 201 Created is the standard RESTful response code for successful POST requests that create a new resource on the server."
    },
    {
        id: 4,
        number: 4,
        question: "What does the 'defer' attribute on a `<script>` tag accomplish?",
        options: [
            { key: "A", text: "It cancels execution until an explicit user action occurs." },
            { key: "B", text: "It executes the script synchronously before parsing HTML." },
            { key: "C", text: "It downloads the script asynchronously and executes it after the HTML document is fully parsed." },
            { key: "D", text: "It forces the script to execute inside a Web Worker thread." }
        ],
        correctAnswer: "C",
        explanation: "The defer attribute downloads scripts in parallel with DOM parsing and executes them in document order once DOMContentLoaded is ready."
    },
    {
        id: 5,
        number: 5,
        question: "Which data structure operates on a First-In, First-Out (FIFO) principle?",
        options: [
            { key: "A", text: "Queue" },
            { key: "B", text: "Stack" },
            { key: "C", text: "Binary Search Tree" },
            { key: "D", text: "Hash Map" }
        ],
        correctAnswer: "A",
        explanation: "A Queue processes elements in the exact order they arrive (FIFO), whereas a Stack uses Last-In, First-Out (LIFO)."
    }
];
