# Knowledge Graph Generator Using Generative AI

An interactive visualization tool for male infertility conditions, their biomarkers, and relationships, based on comprehensive research paper analysis. This project leverages advanced AI and Natural Language Processing techniques to automatically extract, analyze, and visualize complex medical knowledge from research papers.

## AI & NLP Technologies

- **Large Language Models (LLMs)**: Utilized for understanding and extracting complex medical relationships from research papers
- **Named Entity Recognition (NER)**: Identifies biomarkers, conditions, and medical terms from scientific text
- **Relation Extraction**: Automatically discovers relationships between biomarkers and medical conditions
- **Knowledge Graph Generation**: Transforms unstructured text into structured, interconnected knowledge
- **Text Mining**: Processes research papers to extract relevant medical information
- **Semantic Analysis**: Understanding context and meaning in medical literature
- **Automated Data Extraction**: Converts research findings into structured JSON format

## Live Demo
Visit [https://RonitGandotra05.github.io/Knowledge-Graph-Generator-Using-Generative-AI](https://RonitGandotra05.github.io/Knowledge-Graph-Generator-Using-Generative-AI)

## Conditions Covered

1. Azoospermia - Complete absence of sperm in semen
2. Oligospermia - Low sperm concentration
3. Asthenozoospermia - Poor sperm motility
4. Teratospermia - Abnormal sperm morphology
5. Hypospermia - Low semen volume

## Directory Structure

```
project-root/
├── condition-name/           # For each condition (e.g., azoospermia/)
│   ├── html/                # Graph visualization files
│   ├── json/                # Biomarker data
│   ├── mapping/             # Mapping files
│   └── research_papers/     # Research papers and documentation
├── index.html               # Main entry point
├── 404.html                # Error page
├── knowledge_graph.json     # Combined knowledge graph data
└── README.md               # This file
```

## Features

- AI-powered knowledge extraction and relationship mapping
- Interactive knowledge graph visualization for each condition
- Automated biomarker and relationship identification
- Scientific citations with DOI links
- Physics-based layout
- Responsive design
- Cross-referenced research data
- Condition-specific data organization
- Natural Language Processing for medical text analysis

## Data Sources

Each condition's research papers and documentation can be found in their respective `research_papers` directories.

## Usage

1. Navigate to the main page through index.html
2. Select a condition to view its specific knowledge graph
3. Click on nodes to view detailed information
4. Use control panel for graph manipulation
5. Drag nodes to rearrange
6. Toggle physics simulation
7. Access original research through DOI links

## Technical Stack

- HTML5
- JavaScript
- vis.js Network library
- Custom CSS

## Local Development

1. Clone the repository:
```bash
git clone https://github.com/RonitGandotra05/Knowledge-Graph-Generator-Using-Generative-AI.git
```

2. Open index.html in a modern web browser

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Citation

If you use this visualization in your research, please cite:

```bibtex
@misc{knowledge-graph-generator,
  author = {Ronit Gandotra},
  title = {Knowledge Graph Generator Using Generative AI},
  year = {2024},
  publisher = {GitHub},
  url = {https://github.com/RonitGandotra05/Knowledge-Graph-Generator-Using-Generative-AI}
}
```

## Acknowledgments

- vis.js Network library
- Original research paper authors
- Contributors and reviewers 