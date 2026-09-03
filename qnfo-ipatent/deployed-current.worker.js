var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var __defProp222 = Object.defineProperty;
var __name222 = /* @__PURE__ */ __name22((target, value) => __defProp222(target, "name", { value, configurable: true }), "__name");
var AI_EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
var AI_DRAFT_MODELS = [
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  // user-confirmed free reasoning model (primary)
  "@cf/google/gemma-7b-it-lora",
  "@cf/meta-llama/llama-2-7b-chat-hf-lora",
  "@cf/mistral/mistral-7b-instruct-v0.2-lora"
];
var IDEA_BANK = JSON.parse(`[{"title": "Analog Quantum Observation And Simulation System Using Non Collapsing Probabilistic States (1)", "technical_field": "99_Brutal_Cleanup", "description": "OF THE DISCLOSURE A system for analog quantum information processing is disclosed, configured to operate on quantum states without inducing immediate projective collapse. The system comprises an engineered Wave-Sustaining Medium (WSM) designed to sculpt and sustain delocalized resonant quantum field patterns, functioning at elevated temperatures (10K-30K) due to an integrated multi-modal nanoscale noise mitigation system. Information is encoded and manipulated via precisely tuned analog electromagnetic fields, interpreting quantum superposition as a complex chord of frequencies. A non-destructive measurement system performs resonant selection by selectively interacting with specific\u2026"}, {"title": "Apparatus For Harmonic Resonance Computing Resonant Field Comput Non Provisional 2025 07 24", "technical_field": "General", "description": "field detection and analysis components configured to measure final quantum states of the resonant wave fields to extract computational results; and a classical control system configured to orchestrate said field generation components, field modulation components, and field detection and analysis components, and further configured to implement controlled decoherence as a computational mechanism for inherent error self-correction and state stabilization by engineering dissipative processes within the apparatus. 2. The apparatus of embodiment 1, wherein the quantum properties comprise at least one of quantized energy states, phase relationships, amplitude distributions, polarization\u2026"}, {"title": "Autaxys Ontological Framework And Generative Engine Provisional Patent Application 20250719 222735", "technical_field": "General", "description": "A computer-implemented system and method for generating emergent patterns and simulating physical phenomena are disclosed. The system operates based on the principle of Autaxys, defined as the intrinsic capacity for self-ordering, self-arranging, and self-generating patterned existence. A \\"generative engine\\" computationally processes relational data through core operational dynamics including relational processing, spontaneous symmetry breaking, feedback dynamics, resonance, and critical state transitions. These dynamics are guided by meta-logical principles such as intrinsic coherence, conservation of distinguishability, parsimony, intrinsic determinacy/emergent probabilism, and\u2026"}, {"title": "Computational System And Method For Generating Emergent Patterns Provisional Patent Application 20250720 050637", "technical_field": "General", "description": "OF THE INVENTION The present invention provides a computer-implemented system and method for generating emergent patterns and simulating physical phenomena based on an intrinsic generative computational process. The system employs a \\"Generative Pattern Discovery System\\" (GPDS) comprising one or more interconnected computational modules configured to execute core operational dynamics, including relational processing, controlled perturbation, iterative refinement, pattern amplification, and phase transition detection. These dynamics are guided by computationally defined principles such as optimizing pattern coherence, preserving distinct elements, promoting structural parsimony,\u2026"}, {"title": "Harmonic Quantum Computing Platform And Method For Optimization And Universal Computation V1", "technical_field": "Generic and Mixed", "description": "OF THE INVENTION The present invention provides a comprehensive and robust quantum computing solution that addresses critical challenges of scalability, operating cost, and environmental stability. The disclosed quantum computing platform leverages a room-temperature, harmonic computing architecture realized on a scalable silicon photonics platform. This configuration provides a pathway to practical quantum advantage. The present quantum computing platform is a scalable, room-temperature, dual-mode quantum computing platform fabricated on a monolithic silicon photonics integrated circuit (PIC). The platform encodes and processes information through the manipulation of coherent harmonic\u2026"}, {"title": "Harmonic Resonance Computer Hrc System On Chip With Self Optimiz Non Provisional Patent Application 20250728 192001", "technical_field": "General", "description": "## ABSTRACT OF THE DISCLOSURE A hybrid, room-temperature computational System-on-Chip (SoC) is disclosed, integrating a general-purpose digital processing unit, a real-time digital control unit, and a self-optimizing photonic co-processor. The photonic co-processor employs a dynamically reconfigurable optical energy landscape, generated by a spatially programmable optical modulator, to represent computational problems. A closed-loop feedback process, managed by the real-time digital control unit, continuously measures the light state within the photonic co-processor. This measurement is used to iteratively calculate and apply updates to both the coherent light drive signal and the\u2026"}, {"title": "Harmonic Resonance Computer System On Chip With Self Optimizing Photonic Co Processor", "technical_field": "Wave Based Computing", "description": "OF THE DISCLOSURE A hybrid, room-temperature computational System-on-Chip (SoC) is disclosed, integrating a general-purpose digital processing unit, a real-time digital control unit, and a self-optimizing photonic co-processor. The photonic co-processor employs a dynamically reconfigurable optical energy landscape, generated by a spatially programmable optical modulator, to represent computational problems. A closed-loop feedback process, managed by the real-time digital control unit, continuously measures the light state within the photonic co-processor. This measurement is used to iteratively calculate and apply updates to both the coherent light drive signal and the optical modulation\u2026"}, {"title": "Harmonic Resonance Computing And Architectures For Quantum Information Processing", "technical_field": "Quantum Resonance Computing", "description": "dalities. \u2022 Initial Content Input: Accepts diverse content, including unstructured (user prompts, existing documents), semi-structured (XML, JSON), or structured data (databases, APIs, real-time streams), across modalities (textual, visual, auditory). \u2022 Iterative Refinement toward Target/Emergent Output State: The system iteratively refines the input content. The target can be a predefined output state or, uniquely, an \\"emergent output state\\" (dynamically determined optimal content quality, structure, or thematic coherence, balancing multiple attributes, e.g., 'most engaging marketing ad'). This is achieved through continuous internal evaluation and adaptive modification. \u2022 Optimization\u2026"}, {"title": "Harmonic Resonance Computing And Resonant Field Computers For Frequency Based Quantum", "technical_field": "Wave Based Computing", "description": "A novel computational paradigm, Harmonic Resonance Computing (HRC), and associated systems, Resonant Field Computers (RFCs), are disclosed for frequency-based quantum computation. Unlike particle- centric quantum computing, HRC encodes quantum information into the quantized energy states, phase relationships, and amplitude distributions of resonant wave fields, such as electromagnetic (e.g., photons in cavity modes) or acoustic fields (e.g., phonons). RFCs comprise resonance chambers, field generators, modulators, and detectors configured to manipulate these quantized fields through precisely tuned resonant quantum interactions. This approach leverages the collective properties and high\u2026"}, {"title": "Harmonic Resonance Computing And Resonant Field Computers Provisional Patent Application 20250723 070750 (1)", "technical_field": "General", "description": "# ABSTRACT A novel computational paradigm, Harmonic Resonance Computing (HRC), and associated systems, Resonant Field Computers (RFCs), are disclosed for frequency-based quantum computation. Unlike particle-centric quantum computing, HRC encodes quantum information into the quantized energy states, phase relationships, and amplitude distributions of resonant wave fields, such as electromagnetic (e.g., photons in cavity modes) or acoustic fields (e.g., phonons). RFCs comprise resonance chambers, field generators, modulators, and detectors configured to manipulate these quantized fields through precisely tuned resonant quantum interactions. This approach leverages the collective properties\u2026"}, {"title": "Harmonic Resonance Computing Hrc System And Method Utilizing A W Provisional Patent Application 20250719 004536", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE A Harmonic Resonance Computing (HRC) system and method are disclosed, shifting from particle-centric models to a field-theoretic approach. The system utilizes an engineered Wave-Sustaining Medium (WSM) configured to support delocalized quantum resonant electromagnetic field state patterns, termed \\"h-qubits,\\" as fundamental computational units. A control system applies tailored electromagnetic fields to the WSM, inducing controlled interactions and evolution of these h-qubit patterns, thereby performing computation based on their collective resonant behavior. The HRC architecture operates on a \\"frequency ontology,\\" where information is encoded and processed based on\u2026"}, {"title": "Harmonic Resonance Computing Provisional Patent Application 20250713 202546", "technical_field": "General", "description": "OF THE INVENTION The present disclosure introduces Harmonic Resonance Computing (HRC), a novel computing paradigm that realizes computation by establishing, manipulating, and interpreting resonant energy states within specifically structured physical media or by leveraging the intrinsic dynamics of large-scale distributed networks. This approach fundamentally departs from particle-centric, binary qubit models by utilizing a physical medium engineered with a precise geometry, such as a three-dimensional (3D) toroidal configuration, or by repurposing the intrinsic electromagnetic dynamics of existing network infrastructure, such as telecommunications networks. In the engineered toroidal\u2026"}, {"title": "Harmonic Resonance Computing System And Method For Field Theoretic Computation", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE A Harmonic Resonance Computing (HRC) system and method are disclosed, shifting from particle-centric models to a field-theoretic approach. The system utilizes an engineered Wave-Sustaining Medium (WSM) configured to support delocalized quantum resonant electromagnetic field state patterns, termed \\"h-qubits,\\" as fundamental computational units. A control system applies tailored electromagnetic fields to the WSM, inducing controlled interactions and evolution of these h-qubit patterns, thereby performing computation based on their collective resonant behavior. The HRC architecture operates on a \\"frequency ontology,\\" where information is encoded and processed based on\u2026"}, {"title": "Harmonic Resonance Computing System And Method Using Engineered Field State Qubits", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE A harmonic resonance quantum computing system utilizes a precisely engineered Wave-Sustaining Medium (WSM) to sculpt and support delocalized, resonant electromagnetic field state patterns as h-qubits. The WSM comprises High-Temperature Superconductors and ultra-low-loss dielectric materials, engineered for high quality factors and low loss tangents, enabling operation at elevated cryogenic temperatures between 10K and 30K. The system integrates a multi-modal nanoscale noise mitigation system co-fabricated within the WSM, providing intrinsic coherence enhancement. Computation and communication are seamlessly unified through the WSM's inherent field dynamics, addressing\u2026"}, {"title": "Harmonic Resonance Computing System And Method Utilizing A Physical Medium With 3D", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE A Harmonic Resonance Computing system and method are disclosed, utilizing a physical medium engineered with a three-dimensional (3D) toroidal geometry. This unique geometry supports quantum states characterized by a spectrum of semi-harmonic energy levels, which arise from the geometry's periodic boundary conditions and inherent non-linearity. A precise mathematical model, including a GM-function and a second equation, predicts the exact positions of stable quantum states (constructive interference) and unstable nodes (destructive interference) within this geometry. Computation is performed by applying resonant fields corresponding to these predicted semi-harmonic\u2026"}, {"title": "Integrated Nanoscale Quantum Shield For Enhanced Coherent Operation At Elevated Temperatures", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE An integrated nanoscale quantum shield is disclosed for enhancing coherent operation of quantum systems at elevated temperatures. The shield comprises a multi-modal noise mitigation system that integrates photonic bandgap structures, phononic bandgap structures, integrated quasiparticle traps, topological protection layers, liquid dielectric shielding layers, and geometric frustration lattices. This sophisticated integration is configured to simultaneously mitigate various environmental noise sources, including electromagnetic, phononic, thermal, particle, spin, and chemical noise, thereby enabling quantum systems to maintain high coherence, such as a T2 coherence time\u2026"}, {"title": "Liquid Shielded Quantum Device Provisional 2025 07 24", "technical_field": "General", "description": "allenges with environmental noise and efficient light-matter coupling. These stringent environmental requirements make quantum devices impractical for widespread deployment, especially in applications requiring ambient temperature operation, portability, or integration into existing infrastructure. Biological systems, however, exhibit remarkable examples of coherent quantum processes occurring at physiological temperatures. Photosynthesis, olfaction, and enzyme catalysis are believed to involve quantum mechanical phenomena that persist despite the warm, noisy environment of a living cell. Research suggests that the highly ordered, structured water environments within cells play a crucial\u2026"}, {"title": "Machine Learning Architecture Design And Training", "technical_field": "Topological Computing Systems", "description": "OF THE DISCLOSURE A system and method for designing and training machine learning models based on generative first principles is disclosed. A method for designing a machine learning architecture involves calculating a topological stability score for a candidate architecture using a predefined resonance metric. The resonance metric evaluates stability based on number-theoretic properties of the architecture's parameter count (N), allowing for principled architecture selection prior to training. A method for training a machine learning model involves encoding input data into a number-theoretic representation by mapping semantic features to distinct prime numbers. The model is trained by\u2026"}, {"title": "Mass Frequency Identity M For Unifying Relativity And Quantum Me Non Provisional Patent Application 20250730 123228", "technical_field": "General", "description": "## ABSTRACT OF THE DISCLOSURE An Autaxys framework proposes reality as an intrinsically self-ordering, self-arranging, and self-generating system, fundamentally an evolving algorithm. This framework shifts from substance-based ontologies to a process-centric view, emphasizing dynamic processes and emergent patterns. Central to Autaxys is the Mass-Frequency Identity (m=\u03C9), which unifies General Relativity and Quantum Mechanics by reinterpreting mass as an intrinsic processing frequency of fundamental patterns within a Universal Relational Graph (URG). The Autaxic Trilemma (Novelty, Efficiency, Persistence) acts as the core generative engine, driving cosmic evolution and defining physical\u2026"}, {"title": "Mechanical Oscillator Networks For Computation Non Provisional Patent Application 20250728 105346", "technical_field": "General", "description": "## ABSTRACT OF THE DISCLOSURE A novel computational paradigm redefines computation as an emergent property of dynamic, interacting frequency fields, moving beyond particle-centric models. This approach leverages principles of resonance, phase alignment, and time non-locality for information processing. Exemplary architectures include Harmonic Resonance Computing (HRC), which utilizes complex vibration patterns within a continuous field, and Memcomputing, which integrates memory and processing functions using interacting memprocessors and frequency encoding. This paradigm offers inherent scalability, enhanced stability, and integrated error resilience over qubit-based systems. It also\u2026"}, {"title": "Mechanical Oscillator Networks For Computation Provisional Patent Application 20250728 104705", "technical_field": "General", "description": "# SUMMARY OF THE INVENTION The present invention introduces a novel computational paradigm, termed harmonic computing, which fundamentally reinterprets computation as an emergent property of dynamic, interacting frequency fields. This paradigm diverges significantly from traditional particle-centric views, embracing a continuous, field-theoretic perspective. The invention leverages principles of resonance, phase alignment, and time non-locality for information processing, offering a profound shift in how computational operations are conceived and executed. Key architectural embodiments, such as Resonant Field Computing (RFC), Recursive Resonant Architecture (RRA), and Memcomputing, are\u2026"}, {"title": "Method For Fabricating Superconducting Qubits With Integrate Product 20250618 212321", "technical_field": "99_Brutal_Cleanup", "description": "Claims constitute the operative legal definition of the invention, delineating the precise scope of the exclusive rights conferred by the patent. Their formulation demands exceptional precision, rigorous support within the specification, and adherence to the substantive requirements of patentability: eligible subject matter (\xA7 101), novelty (\xA7 102), and non-obviousness (\xA7 103) over the pertinent prior art. During examination, claims are interpreted by the USPTO according to their **Broadest Reasonable Interpretation (BRI)** consistent with the specification, as understood by a **Person Having Ordinary Skill in the Art (PHOSITA)**. Following patent issuance, claims are subject to a\u2026"}, {"title": "Method For Solving Optimization Problems Via Dynamic Optical Ene Provisional Patent Application 20250728 191634", "technical_field": "General", "description": "# SUMMARY OF THE INVENTION The present invention introduces a novel computational system-on-chip (SoC), herein referred to as a hybrid opto-electronic optimization system, which functions as a hybrid, room-temperature, self-optimizing photonic co-processor. This system is specifically designed to achieve unprecedented computational speed and power efficiency for complex optimization problems by utilizing a dynamically reconfigurable optical energy landscape, precisely controlled by a real-time digital feedback loop. This architecture is physically plausible, commercially manufacturable using existing CMOS-compatible technologies, and represents a fundamental paradigm shift in\u2026"}, {"title": "Methods For Programming Non Electronic Media In Harmonic Resonance Computing", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE Disclosed are methods for programming Harmonic Resonance Computing (HRC) units by applying structured non-electrical physical fields to a Wave-Sustaining Medium (WSM). These fields induce reconfigurable physical state changes or resonant adjustments within the WSM, thereby directly embedding computational instructions or problem definitions without reliance on traditional electronic signaling. This enables highly energy-efficient, compact, and reconfigurable computational units for various applications, including IoT and mobile environments."}, {"title": "Nexus Recursive Harmonic Framework Provisional Patent Application 20250720 053709", "technical_field": "General", "description": "# SUMMARY OF THE INVENTION The present invention provides computer-implemented methods and systems for leveraging emergent harmonic constants to stabilize, optimize, and analyze recursive computational processes and data structures. In one aspect, the invention introduces a novel framework, referred to herein as the Nexus Recursive Harmonic Framework, which posits that fundamental constants such as pi (\u03C0) and the golden ratio (\u03C6) are not static values but rather emerge as solutions to structural imbalances within dynamic recursive feedback loops. The invention provides methods for dynamically determining and applying a universal harmonic constant (H), such as H=0.35, derived from\u2026"}, {"title": "Parametric Adiabatic Coherent Optimizer For Combinatorial Optimization V4", "technical_field": "Quantum Resonance Computing", "description": "ngths), and receive raw output data (e.g., measured phase states) at terabit-per-second rates. The optical signals are converted to electrical signals at the **PCP** interface using integrated optoelectronic transceivers. This high-bandwidth, low-latency interconnection enables the rapid programming of large-scale **PCP** arrays and the efficient transfer of vast amounts of solution data for post-processing, minimizing communication bottlenecks between the classical and co-processing units. * **3. Alternative Problem Formulation Software:** * **Identified Function:** Problem Pre-processing and Formulation software within the **CHC**. * **Proposed Alternative:** The **CHC** executes an\u2026"}, {"title": "Passive Photonic Quasi Crystal Apparatus For Robust Fractal Spectral Filtering And Method Of Manufacture Thereof V1", "technical_field": "Photonic Computing", "description": "OF THE DISCLOSURE [0112] A passive photonic apparatus comprises a substrate and a photonic lattice with optical resonators. A physical dimension of each resonator is modulated by a deterministic irrational function relative to its spatial index, inducing an Aubry-Andr\xE9-Harper potential and generating a fractal transmission spectrum with topologically protected spectral gaps. A negative-tone polymer cladding passively athermalizes the apparatus. A method of manufacture includes defining a Hamiltonian with an irrational parameter, mapping modulated resonator dimensions to a lithographic layout with modulation depth exceeding fabrication grid resolution, and fabricating the apparatus. This\u2026"}, {"title": "Phase Encoded Information System For Unified Storage And Processing", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE A unified information processing system is disclosed, which integrates data storage and processing within a Wave-Sustaining Medium (WSM). Information is encoded in the phase, amplitude, and spatial distribution of complex standing wave patterns or resonant field states within the WSM. The system utilizes a three-dimensional periodic lattice of superconducting resonators, such as Tantalum, designed for high internal quality factors and supporting topologically protected patterns. Computational operations are performed directly within the stored information via localized electromagnetic fields at terahertz frequencies, inducing non-linear optical effects, thereby\u2026"}, {"title": "Probabilistic Information Unit For Data Encoding And Error Correction", "technical_field": "99_Brutal_Cleanup", "description": "This invention discloses a novel method and system for encoding and processing information using probabilistic states in classical systems. The system utilizes stochastic probability distributions and error-correcting codes to achieve high-fidelity information processing without relying on quantum superposition or entanglement. The invention is particularly useful for applications in data storage, communication, and machine learning."}, {"title": "Probabilistic Quantum Information Processing Via Information States", "technical_field": "Niche and Undeveloped", "description": "Information Units: Configurable to represent quantum states as continuous probabilistic distributions (e.g., geometric superpositions in lattice structures). Functional Equivalents: Implementations include microtubule-inspired lattices, photonic arrays, or superconducting qubits (Fig. 1A-1C, not shown). [0008] Enablement: The invention is enabled by principles from quantum information theory (e.g., continuous-variable systems) and experimental work in bio-inspired quantum coherence. For example: Microtubule Lattices: Tubulin subunit arrangements (13-protofilament topology) enable geometric superpositions. Dielectric Shielding: High-permittivity materials (\u03B5 > 50, e.g., SrTiO\u2083) suppress\u2026"}, {"title": "Qpu Provisional Patent", "technical_field": "Bio Inspired", "description": "1 Abstract 23 KB Warning: One or more pages are missing page numbering. Page numbering will be automatically applied after submission. Comments were found and have been removed. Text must be in a single column. Please review and revise if necessary. rowan-quni-doc-19749- SPEC.docx 8 Specification 32 KB Warning: Comments were found and have been removed. Paragraph numbering is missing from the specification. Please review the specification and revise if necessary. Text must be in a single column. Please review and revise if necessary. Page 1 of 2 Digest DOCUMENT MESSAGE DIGEST(SHA-512) generatedADS68995359.pdf 25F5218432127A97EC2F1CB2F3FE28378480D2E05B4F0BDB2\u2026"}, {"title": "Quantum Biology Inspires Computing Inventions", "technical_field": "General", "description": "herence could be used to design more stable and robust qubits. For example, researchers are exploring the use of photosynthetic proteins as qubits . * **Quantum algorithms:** Quantum entanglement could be used to develop new quantum algorithms that are more efficient than classical algorithms. For example, researchers are exploring the use of bird navigation mechanisms to develop new quantum algorithms for optimization problems . * **Error correction:** Quantum tunneling could be used to develop new error correction protocols for quantum computers. For example, researchers are exploring the use of enzyme catalysis mechanisms to develop new quantum error correction codes . Furthermore,\u2026"}, {"title": "Quantum Computing Patentability Memo Diffs 20250628 104311", "technical_field": "General", "description": "lexity, latency, and I/O count, enabling more complex control and feedback. However, these electronics are sources of electromagnetic noise (switching noise, digital noise, amplifier noise) and heat dissipation. PC shielding is critical for isolating the sensitive qubits from these sources via robust electromagnetic and thermal barriers. PC bandgaps are designed to target the noise spectrum of the electronics. Routing signals between the electronics layer and the qubit layer requires careful design of vias, airbridges, or waveguides passing through PC structures, ensuring minimal noise coupling and signal degradation. The noise floor and heat dissipation profile of the cryogenic\u2026"}, {"title": "Quantum Computing System With Liquid Helium Operation And Hardware Level Bosonic Error Correction", "technical_field": "63940352 Quantum Computing", "description": "on (175), a Feedback-Controlled Active Isolation (176) system, or a Pneumatic Isolation Platform (177). A kit (K100) includes a plurality of vibration isolation components (171). #### 2.7 Control Electronics (190) [0036] Control Electronics (190) are electrically coupled to the Three-Dimensional Microwave Cavity (110). These electronics (190) generate and deliver precise control pulses necessary for quantum operations, including qubit initialization, quantum gate execution, and state readout. [0037] The Control Electronics (190) receive instructions from a Classical Computing Interface (180). They translate these instructions into microwave pulses (D8.1), flux pulses (D8.2), optical\u2026"}, {"title": "Quantum Entanglement Generator With Enhanced Coherence  Bb84 Product 20250619 095627", "technical_field": "99_Brutal_Cleanup", "description": "--- generation_timestamp: 2025-06-19T04:11:27.193Z project_name: \\"Quantum Entanglement Generator With Enhanced Coherence (BB84)\\" autologos_process_mode: distillation initial_prompt_summary: \\"--- FILE: Quantum Entanglement Generator With Enhanced Coherence.md --- Quantum Entanglement Generator With Enhanced Coherence [0001] The present i...\\" final_iteration_count: 1 max_iterations_setting: 10 prompt_input_type: direct_text prompt_source_details: \\"log_import_Quantum_Claim_Wherein_Shield_Medium_log_20250617_133956.json\\" model_configuration: model_name: 'gemini-2.5-flash-preview-04-17' temperature: 0.20 top_p: 0.82 top_k: 15 --- Decoherence constrains quantum systems, conventionally\u2026"}, {"title": "Quantum Key Distribution With Machine Learning Enhanced Eavesdropping Detection", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE The present invention enhances Quantum Key Distribution (QKD) systems by transforming decoherence from a vulnerability into an active security mechanism for eavesdropping detection. It introduces a novel approach where a decoherence control module actively induces a predetermined, non-Markovian decoherence signature into quantum states transmitted through the channel. A processing unit then utilizes a specialized machine learning algorithm to analyze deviations from this signature, accurately classifying them as either natural environmental noise or a malicious eavesdropping attempt. This method, potentially employing terahertz-frequency pulse generators for controlled\u2026"}, {"title": "Quantum Key Distribution With Machine Learning V4", "technical_field": "Quantum Resonance Computing", "description": "OF THE INVENTION The present invention addresses critical limitations inherent in Quantum Key Distribution (QKD) systems, including restricted transmission range, susceptibility to environmental noise, and vulnerabilities arising from device imperfections, particularly in the context of advanced threat vectors and emerging computational challenges such as Harmonic Resonance Computing (HRC). The invention introduces a novel paradigm that transforms quantum decoherence from a passive vulnerability into an active, robust security mechanism, leveraging controlled decoherence and machine learning for enhanced eavesdropping detection. In a primary embodiment, a Quantum Key Distribution (QKD)\u2026"}, {"title": "Quantum Processing Unit With Bio Inspired Lattice Structure For Enhanced Qubit Coherence And Scalability", "technical_field": "Bio Inspired", "description": "OF THE INVENTION The invention's novelty lies in its bio-inspired design that mimics the structure of neuronal microtubules to create a uniquely tailored electromagnetic environment for enhancing qubit coherence and enabling higher temperature operation than conventional quantum computing architectures. Specifically, the invention combines the following new elements: * A Microtubule-Inspired Lattice Structure: A cylindrical lattice fabricated using CMOS-compatible processes and high-temperature superconductors (HTS), designed to mimic the geometry of biological microtubules. This structure is unlike any current qubit architecture (which are typically planar or use simple multi-chip\u2026"}, {"title": "Quantum Resonance Computing Systems And Methods For Stable Quantum Computation", "technical_field": "Quantum Resonance Computing", "description": "A Quantum Resonance Computing (QRC) system and method are disclosed for stable quantum computation. The invention leverages intrinsic, stable resonant frequencies within quantum systems to encode and process quantum information, addressing limitations of conventional gate-based quantum computing, particularly quantum decoherence. Inspired by classical resonant computing devices such as the parametron, QRC utilizes continuous parametric excitation to establish and sustain robust quantum resonant states for information processing, thereby enhancing coherence and stability."}, {"title": "Quantum Resonance Dynamics Framework For Stabilized Qubits And Non Collapsing Wavefunctions", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE A Quantum Resonance Dynamics (QRD) framework is disclosed for quantum information processing. This framework reinterprets fundamental quantum phenomena, stabilizing quantum information units through inherent resonance rather than traditional error correction. Wavefunction collapse is re-envisioned as a structured phase-selection process, and decoherence as a transition to a stable phase-locked resonance state. The system utilizes a Wave-Sustaining Medium (WSM) with engineered three-dimensional toroidal physical geometry and chiral lattice structures. These properties facilitate chiral phase-locking resonance and topological protection, enabling robust quantum coherence\u2026"}, {"title": "Quantum Resonance Dynamics Qrd Framework For Stabilized Qubits A Provisional Patent Application 20250719 150841", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE A Quantum Resonance Dynamics (QRD) framework is disclosed for quantum information processing. This framework reinterprets fundamental quantum phenomena, stabilizing quantum information units through inherent resonance rather than traditional error correction. Wavefunction collapse is re-envisioned as a structured phase-selection process, and decoherence as a transition to a stable phase-locked resonance state. The system utilizes a Wave-Sustaining Medium (WSM) with engineered three-dimensional toroidal physical geometry and chiral lattice structures. These properties facilitate chiral phase-locking resonance and topological protection, enabling robust quantum coherence\u2026"}, {"title": "Resonance Breach Analysis Methodology And System For Quantum Key Distribution", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE The present disclosure introduces a novel Resonance Breach Analysis (RBA) methodology and system designed to identify latent security vulnerabilities within practical Quantum Key Distribution (QKD) systems. Despite QKD's theoretical robustness, physical implementation flaws can lead to exploitable side-channel attacks. The RBA method systematically addresses this by identifying potential resonant interaction points within QKD hardware components, applying precisely controlled physical stimuli tailored to these points, and monitoring for disproportionate, non-linear technical responses. Detecting such unexpected changes indicates a latent security vulnerability, enabling\u2026"}, {"title": "Resonance Breach Analysis Rba Methodology And System For Qkd Vul Provisional Patent Application 20250719 001733", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE The present disclosure introduces a novel Resonance Breach Analysis (RBA) methodology and system designed to identify latent security vulnerabilities within practical Quantum Key Distribution (QKD) systems. Despite QKD's theoretical robustness, physical implementation flaws can lead to exploitable side-channel attacks. The RBA method systematically addresses this by identifying potential resonant interaction points within QKD hardware components, applying precisely controlled physical stimuli tailored to these points, and monitoring for disproportionate, non-linear technical responses. Detecting such unexpected changes indicates a latent security vulnerability, enabling\u2026"}, {"title": "Resonance Breach Analysis System And Method For Quantum Key Distribution V2", "technical_field": "Quantum Resonance Computing", "description": "OF THE INVENTION The present disclosure relates generally to security assessment, and more particularly, to systems and methods for identifying latent security characteristics within Quantum Key Distribution (QKD) systems. Practical implementations of QKD systems, while possessing robust theoretical security guarantees, exhibit specific characteristics at the physical implementation layer that are precisely characterized and exploited to circumvent conventional cryptographic and computational security models. These characteristics manifest as subtle physical phenomena or intricate system-level interactions, frequently leading to sophisticated side-channel attacks that exploit specific\u2026"}, {"title": "Resonant Field Cipher Product 1.1 Title Of The Invention 0708 0543", "technical_field": "General", "description": "## SUMMARY OF THE INVENTION The present invention introduces Resonant Field Computing (RFC), a novel quantum computing paradigm that fundamentally shifts from manipulating discrete particles to manipulating coherent resonant electromagnetic field states within a continuous, engineered medium. Conceptually inspired by a proposed process ontology (Autaxys) where reality is a dynamically self-organizing computational system and mass is fundamentally a manifestation of frequency ($m=\\\\omega$ in natural units), RFC seeks to embody principles of Persistence (maintaining stable structures/states) and Efficiency (optimizing configurations for low loss/high performance) in engineered physical\u2026"}, {"title": "Resonant Field Computing Rfc Based On Autaxys Principles Non Provisional Patent Application 20250730 124831", "technical_field": "General", "description": "## ABSTRACT OF THE DISCLOSURE The disclosure presents the Autaxys framework, modeling reality as an intrinsically self-ordering, self-generating evolving algorithm. It shifts from substance-based ontologies to a process-centric view, emphasizing dynamic patterns. Central is the Mass-Frequency Identity (m=\\\\u03c9), reinterpreting mass as an intrinsic processing frequency of fundamental patterns within a Universal Relational Graph (URG). The Autaxic Trilemma (Novelty, Efficiency, Persistence) drives cosmic evolution and defines physical laws through continuous, self-validating computation. This framework provides a coherent explanation for spacetime, gravity, and particles, and has\u2026"}, {"title": "Resonant Field Computing Rfc Based On Autaxys Principles Provisional Patent Application 20250730 124004", "technical_field": "General", "description": "# SUMMARY OF THE INVENTION The present disclosure introduces a novel computational paradigm, herein referred to as **Resonant Field Information Processing (RFIP)**, or more broadly, **Resonant Field Computing (RFC)**. This paradigm leverages the principles of resonant interactions within various types of physical fields (e.g., electromagnetic, acoustic, quantum) to perform computational operations. In this context, \\"computing\\" is broadly defined as any process involving the transformation, manipulation, storage, or transmission of information, states, or energy within a system. This encompasses, but is not limited to, data processing, pattern recognition, simulation, optimization,\u2026"}, {"title": "Resonant Field Computing Rfc Based On The Autaxys Framework Provisional Patent Application 20250730 115649", "technical_field": "General", "description": "# SUMMARY OF THE INVENTION The present invention introduces novel systems and methods for field-based computation, which leverages dynamic interactions within and between computational fields to process information and model complex systems. This approach is underpinned by a unified dynamic process ontology, which conceptualizes reality and its computational manifestations as an interconnected network of evolving processes rather than discrete, static entities. This dynamic process ontology provides a structured yet flexible architecture for defining, manipulating, and observing these computational fields and their resonant interactions. In one aspect, the invention provides a\u2026"}, {"title": "Resonant Field Computing System And Method Using Engineered Field State Qubits (1)", "technical_field": "General", "description": "OF THE DISCLOSURE A quantum computing system utilizes a precisely engineered wave-sustaining medium (WSM) to sculpt and support addressable coherent resonant electromagnetic field state patterns, termed h-qubits, where quantum information is encoded in the delocalized quantum state of these patterns. The WSM comprises a three-dimensional superconducting lattice structure and a high-permittitivity, ultra-low-loss dielectric material, and integrates co-fabricated multi-modal nanoscale noise mitigation systems to enhance intrinsic coherence and enable operation at elevated cryogenic temperatures, such as between 10K and 30K. The WSM also functions as a seamless computational space and\u2026"}, {"title": "Spectral Resonance Computing Src System For Intractable Problems Provisional Patent Application 20250719 232423", "technical_field": "General", "description": "OF THE INVENTION The present invention introduces Spectral Resonance Computing (SRC), a novel computational paradigm engineered to efficiently resolve computationally intractable problems, particularly those within the NP (Non-deterministic Polynomial time) complexity class. Unlike conventional digital computing architectures that rely on sequential processing and discrete logic, or established quantum computing techniques that leverage quantum mechanical phenomena for direct calculation, SRC operates by harnessing the intrinsic principles of harmonic resonance and the spontaneous emergence of complex geometric configurations within a dynamic physical system. This system functions as a\u2026"}, {"title": "Spectral Resonance Computing System And Method For Solving Computationally Intractable Problems", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE The present disclosure introduces Spectral Resonance Computing (SRC), a novel computational paradigm designed to solve computationally intractable problems, particularly those in the NP complexity class, such as large integer factorization and the 3-Satisfiability problem. Unlike conventional digital or quantum computing, SRC operates by harnessing the intrinsic principles of harmonic resonance and the spontaneous emergence of complex geometric configurations within a dynamic physical system. Problem parameters are encoded into the initial phase and amplitude relationships of pure resonance harmonics generated by elements like nanoscale piezoelectric vibrators, which\u2026"}, {"title": "System And Method For Controlled Non Markovian Decoherence In Quantum Computing V2", "technical_field": "Quantum Resonance Computing", "description": "## SUMMARY OF THE INVENTION The present invention provides a novel system and method for inducing, controlling, and actively harnessing non-Markovian decoherence as a valuable computational resource in quantum computing and communication. The invention provides a solution to the limitations of conventional quantum systems, which predominantly treat decoherence as an error to be suppressed, by instead utilizing its inherent properties for computational advantage. A core aspect of the invention is the **Decoherence Control Module (DCM)**, which employs engineered noise sources to generate non-Markovian noise. This noise features precisely tailored frequency spectra and temporal profiles,\u2026"}, {"title": "System And Method For Harnessing Controlled Non Markovian Decoherence", "technical_field": "Early_Drafts_202507", "description": "OF THE DISCLOSURE A system and method for harnessing controlled, non-Markovian decoherence in quantum computing and communication. The system includes a decoherence control module configured to intentionally induce decoherence via engineered non-Markovian noise channels. This controlled decoherence is leveraged for various applications, including quantum annealing for optimization, enhanced quantum sensing, advanced error mitigation, and temporal data storage. The system further incorporates dynamic qubit state control and a hybrid quantum-classical interface to precisely manage and utilize these decoherence pathways."}, {"title": "System And Method For High Temperature Topological Quantum Processing", "technical_field": "High Temperature Topological Chiral", "description": "representation. [0332] FAILURE MODES In the event of Thermal Failures, the system tolerates and mitigates a Cooling Failure. The intrinsic error suppression via the large superconducting gap ensures a grace period before decoherence becomes catastrophic, allowing for recovery. [0333] Temperature Fluctuation is another Thermal Failure. While the Pulse Tube Cryocooler [104] provides stable 4K operation, minor fluctuations occur. The topological protection and large gap buffer these fluctuations, preventing immediate loss of quantum coherence. Localized Peltier stages or feedback loops further stabilize temperature. [0334] If the Heat Load Exceeds, the system gracefully degrades or pauses.\u2026"}, {"title": "System And Method For Low Energy Nuclear Reactions For Energy Pr Non Provisional 2025 07 25", "technical_field": "General", "description": "OF THE DISCLOSURE A computer-implemented system and method for generating energy through low-energy nuclear reactions (LENR) at room temperature or near-room temperature conditions. The method involves initiating a nuclear reaction, such as by electrochemical loading of hydrogen isotopes into a metallic lattice, plasma discharge, acoustic cavitation, or laser interaction, and producing energy therefrom. The system comprises a reaction chamber, which can be configured as an electrochemical cell, a plasma chamber, or a solid-state device, designed to facilitate these reactions. An energy extraction mechanism, such as a heat exchanger or thermoelectric generator, is coupled to the chamber\u2026"}, {"title": "System And Method For Probabilistic Quantum Information Processing Via Abstract Information States", "technical_field": "Niche and Undeveloped", "description": "Information Units: Configurable to represent quantum states as continuous probabilistic distributions (e.g., via geometric superpositions in lattice structures). Functional Equivalents: Implementations may include microtubule-inspired lattices, photonic arrays, or superconducting qubits, but the claims are not limited to these embodiments. 2. Probabilistic Processing Mechanisms [0006] Processing means include: Analog Controls: Electromagnetic fields, acoustic waves, or mechanical stress modulate lattice parameters to steer state evolution. Non-Demolition Measurements: Interferometric detectors reconstruct probabilistic distributions via inverse Fourier transforms without collapse. 3.\u2026"}, {"title": "System And Method For Solving Optimization Problems", "technical_field": "Wave Based Computing", "description": "OF THE INVENTION The present invention introduces a novel computational system-on-chip (SoC), herein referred to as a hybrid opto-electronic optimization system, which functions as a hybrid, room-temperature, self-optimizing photonic co-processor. This system is specifically designed to achieve unprecedented computational speed and power efficiency for complex optimization problems by utilizing a dynamically reconfigurable optical energy landscape, precisely controlled by a real-time digital feedback loop. This architecture is physically plausible, commercially manufacturable using existing CMOS-compatible technologies, and represents a fundamental paradigm shift in high-performance\u2026"}, {"title": "System And Method For Topological Scale Invariant Photonic Computation With Analog Emulation Of Quantum Behavior V1", "technical_field": "Photonic Computing", "description": "sed, comprising a substrate, a quasi-periodic photonic lattice defined on the substrate exhibiting discrete scale invariance, a superlattice structure creating a moir\xE9 potential, a topological interface configured to support protected optical modes, a nonlinear optical element configured to generate emergent particle-like excitations, and a detection system configured to interpret interactions of said excitations as computational results. [0011] A photonic system for emulating quantum statistical behavior is disclosed, the system including a light source, an integrated photonic circuit having a reconfigurable topological scale-invariant waveguide architecture, means for generating and\u2026"}, {"title": "System And Method For Unsupervised Iterative Content Refinement Provisional Patent Application 20250722 175720", "technical_field": "General", "description": "# SUMMARY OF THE INVENTION The present invention provides a novel computer-implemented system and method for autonomous, iterative content generation and refinement using artificial intelligence. The core innovation lies in its ability to accept a diverse initial content input, which may include unstructured data such as a user prompt, existing documents, or a partial draft; semi-structured data like XML or JSON files; or structured data from databases, APIs, or real-time data streams. Crucially, this input can encompass various modalities, including textual, visual (e.g., images, video frames), or auditory (e.g., audio clips, speech segments) data. The system then automatically,\u2026"}, {"title": "Systems And Methods For Aperiodic Waveform Modulation Based On Number Theoretic Geometries", "technical_field": "Generic and Mixed", "description": "OF THE INVENTION [0006] The present invention provides a system and method for generating aperiodic communication waveforms based on the geometric encoding of prime numbers. This approach overcomes the limitations of conventional periodic modulation schemes by leveraging the inherent structural stability of prime number distributions mapped onto a geometric manifold. [0007] A primary object of the present invention is to provide a physical layer security mechanism, termed Symbol Waveform Hopping (SWH), that is based on physical resolution limits rather than computational complexity, rendering it immune to quantum and classical computational attacks. The SWH mechanism dynamically changes\u2026"}, {"title": "Systems And Methods For Computation Using Engineered Intrinsic Topological Media", "technical_field": "Topological Broad Typo", "description": "OF THE DISCLOSURE A system for performing a computational operation includes a Physical Medium (PM) engineered to possess an Intrinsic Topological State (ITS) characterized by a protective energy gap for thermal robustness. Information is encoded in a global property of the ITS. A Control System (CS) induces a native dynamical process of the ITS to execute the computational operation, and a Readout System (RS) measures a property of the PM to determine the result. The system operates without active error correction and can function at room temperature. A specialized, non-programmable co-processor is also disclosed. Methods for manufacturing and operating such systems are included."}, {"title": "Systems And Methods For Distributed Quantum Resonance Computing V4", "technical_field": "Quantum Resonance Computing", "description": "## SUMMARY OF THE INVENTION The present invention provides a complete, end-to-end system and method for what is termed herein as Quantum Resonance Computing (QRC), which transforms heterogeneous, geographically distributed telecommunications infrastructure into a programmable, large-scale physical information processing substrate. The invention overcomes the profound and long-standing limitations of the prior art through a synergistic integration of several novel and non-obvious subsystems, signal processing protocols, and control architectures, each of which represents a distinct inventive concept, as well as inventive combinations thereof. A primary object of the invention is to\u2026"}, {"title": "Systems And Methods For Topological Computation", "technical_field": "Topological Broad Typo", "description": "odiment, the low-temperature bonding process is a hybrid bonding process performed at a temperature below 150\xB0 Celsius to preserve a magnetic property of a ferromagnetic layer within the moir\xE9 heterostructure. This specifies the temperature constraint for the final integration step to avoid degrading sensitive materials. [0067] The system of claim [0041] is further described. In this embodiment, the zero-dimensional topologically protected corner state has a coherence time that is at least an order of magnitude longer than a coherence time of edge states on the Physical Medium (PM). This highlights the enhanced stability of the specific corner state used in the HOTI qubit. [0068] A\u2026"}, {"title": "Topological Quantum Computation Using Number Theoretic Pattern Operations V1.0", "technical_field": "99_Brutal_Cleanup", "description": "OF THE DISCLOSURE A system and method for topological quantum computation are disclosed. The method performs computation through a sequence of pattern operations on a quantum state represented as a topological loop on a circle manifold, the loop being characterized by an integer winding number. A pattern writing operation encodes information based on a prime factorization of the winding number. A pattern evolution operation applies a rotation operator to evolve the state. A pattern projection operation extracts a computational result. The invention further discloses a method for designing a quantum device by calculating a resonance metric based on prime factors of a system parameter to\u2026"}]`);
var VZ_TOP_K = 8;
var MAX_DESCRIPTION_LEN = 5e3;
var RATE_LIMIT_WINDOW_MS = 60 * 60 * 1e3;
var RATE_LIMIT_MAX = 20;
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Corpus-Token",
  "Access-Control-Max-Age": "86400"
};
function corsHeaders(extra = {}) {
  return { ...CORS, ...extra };
}
__name(corsHeaders, "corsHeaders");
__name2(corsHeaders, "corsHeaders");
__name22(corsHeaders, "corsHeaders");
__name222(corsHeaders, "corsHeaders");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json" })
  });
}
__name(json, "json");
__name2(json, "json");
__name22(json, "json");
__name222(json, "json");
function html(html2, status = 200) {
  return new Response(html2, {
    status,
    headers: corsHeaders({ "Content-Type": "text/html; charset=utf-8" })
  });
}
__name(html, "html");
__name2(html, "html");
__name22(html, "html");
__name222(html, "html");
function generateId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "USP-";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id + "-" + Date.now().toString(36).toUpperCase();
}
__name(generateId, "generateId");
__name2(generateId, "generateId");
__name22(generateId, "generateId");
__name222(generateId, "generateId");
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
__name(escapeHtml, "escapeHtml");
__name2(escapeHtml, "escapeHtml");
__name22(escapeHtml, "escapeHtml");
__name222(escapeHtml, "escapeHtml");
function sanitize(str, maxLen = 1e4) {
  if (!str) return "";
  return String(str).slice(0, maxLen).trim();
}
__name(sanitize, "sanitize");
__name2(sanitize, "sanitize");
__name22(sanitize, "sanitize");
__name222(sanitize, "sanitize");
async function checkRateLimit(env, ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const result = await env.IPATENT_DB.prepare(
    "SELECT COUNT(*) as cnt FROM submissions WHERE ip_address = ?1 AND created_at > datetime(?2/1000, 'unixepoch')"
  ).bind(ip, windowStart).first();
  const count = result ? result.cnt : 0;
  return {
    allowed: count < RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - count),
    limit: RATE_LIMIT_MAX
  };
}
__name(checkRateLimit, "checkRateLimit");
__name2(checkRateLimit, "checkRateLimit");
__name22(checkRateLimit, "checkRateLimit");
__name222(checkRateLimit, "checkRateLimit");
async function embedText(env, text) {
  const embedResult = await env.AI.run(AI_EMBED_MODEL, { text });
  const vector = embedResult?.data;
  if (!vector || !Array.isArray(vector) || vector.length === 0) {
    throw new Error("Embedding generation failed");
  }
  return Array.isArray(vector[0]) ? vector[0] : vector;
}
__name(embedText, "embedText");
__name2(embedText, "embedText");
__name22(embedText, "embedText");
__name222(embedText, "embedText");
async function searchDisclosures(env, query, limit = VZ_TOP_K) {
  try {
    const vector = await embedText(env, query);
    const results = await env.DISCLOSURES_VZ.query(vector, {
      topK: limit,
      returnMetadata: "all"
    });
    return (results?.matches || []).map((m) => ({
      id: m.id,
      score: m.score,
      title: m.metadata?.title || "",
      section: m.metadata?.section || "",
      technical_field: m.metadata?.technical_field || "",
      source_file: m.metadata?.source_file || "",
      disclosure_text: m.metadata?.text || m.metadata?.disclosure_text || ""
    }));
  } catch (err) {
    console.error("Vectorize search failed:", err.message);
    return [];
  }
}
__name(searchDisclosures, "searchDisclosures");
__name2(searchDisclosures, "searchDisclosures");
__name22(searchDisclosures, "searchDisclosures");
__name222(searchDisclosures, "searchDisclosures");
async function draftDisclosure(env, { title, technicalField, description, ragContext }) {
  const ragText = ragContext.length > 0 ? ragContext.map(
    (r, i) => `EXAMPLE ${i + 1}: "${r.title}" [field: ${r.technical_field || "n/a"}] \u2014 ${(r.disclosure_text || "").slice(0, 500)}`
  ).join("\n\n") : "No similar disclosures found in the database.";
  const prompt = `You are an expert US patent drafter. Write a professional US Provisional Patent Disclosure based on the inventor's description below. Use the provided example disclosures as style references.

## INVENTOR'S DESCRIPTION
Title: ${title}
Technical Field: ${technicalField || "Not specified"}
Description: ${description}

## EXAMPLE DISCLOSURES (for style reference only \u2014 do NOT copy content)
${ragText}

## REQUIRED OUTPUT FORMAT
Output the disclosure with these numbered sections:

## 1. TITLE OF INVENTION
[Exact title]

## 2. TECHNICAL FIELD
[1-3 sentences describing the field of the invention]

## 3. BACKGROUND
[2-4 sentences describing the problem or limitation this invention addresses]

## 4. SUMMARY OF THE INVENTION
[4-8 sentences summarizing what the invention is and its novelty]

## 5. DETAILED DESCRIPTION
[5-12 sentences describing how the invention works, its components, and implementation details. Include enough detail for someone skilled in the art to understand and reproduce it.]

## 6. CLAIMS
[List 8-15 numbered patent claims in standard USPTO format:
- Claim 1 should be the broadest independent claim
- Subsequent claims should add specific limitations and dependencies
- Use "A method/system/apparatus comprising:" format for independent claims
- Use "The method of claim X, further comprising:" for dependent claims
- Include claims covering: method, system, apparatus, and computer-readable medium]

## 7. ABSTRACT
[150-250 word abstract summarizing the invention, its technical contribution, and key advantage]

## 8. INVENTOR DECLARATION
[A statement that the inventor believes this to be a novel invention]

IMPORTANT:
- Write ORIGINAL content based ONLY on the inventor's description \u2014 do NOT copy from the examples.
- Use formal patent language appropriate for USPTO filings.
- Be specific and concrete \u2014 avoid vague generalities.
- The claims are the most important section \u2014 make them detailed and defensible.`;
  let lastError = null;
  let text = "";
  for (const model of AI_DRAFT_MODELS) {
    try {
      const result = await env.AI.run(model, {
        messages: [
          { role: "system", content: "You are an expert US patent attorney and drafter. Write formal, precise, and defensible patent disclosures. Output only the disclosure text \u2014 no preamble or meta-commentary." },
          { role: "user", content: prompt }
        ],
        max_tokens: 4096,
        temperature: 0.7
      });
      text = result?.response || result?.choices?.[0]?.message?.content || "";
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      const sectionCount = ["TITLE OF INVENTION", "TECHNICAL FIELD", "BACKGROUND", "SUMMARY", "DETAILED DESCRIPTION", "CLAIMS", "ABSTRACT"].filter(
        (s) => text.includes(s)
      ).length;
      if (text && sectionCount >= 3) break;
      if (text) {
        lastError = `Model ${model} produced non-compliant output (${sectionCount}/7 sections)`;
        console.error(lastError);
        text = "";
      } else {
        lastError = `Empty response from ${model}`;
      }
    } catch (err) {
      lastError = `${model}: ${err.message}`;
      console.error(`Model ${model} failed:`, err.message);
    }
  }
  if (!text) throw new Error(`All models failed. Last error: ${lastError}`);
  return parseDisclosureSections(text);
}
__name(draftDisclosure, "draftDisclosure");
__name2(draftDisclosure, "draftDisclosure");
__name22(draftDisclosure, "draftDisclosure");
__name222(draftDisclosure, "draftDisclosure");
function parseDisclosureSections(text) {
  text = text.replace(/\*\*(\s*\d+\.\s*[A-Z][^*\n]*?)\s*\*\*/g, "## $1").replace(/^\s*##\s*([A-Z][^\n]*?)\s*$/gm, (m, t) => {
    return /^\d+\./.test(t.trim()) ? m : m;
  });
  const sections = {};
  const patterns = [
    { key: "title", regex: /(?:##\s*)?1\.?\s*TITLE\s*OF\s*INVENTION\s*\n+(.+?)(?=\n*(?:##\s*)?2\.)/si },
    { key: "technical_field", regex: /(?:##\s*)?2\.?\s*TECHNICAL\s*FIELD\s*\n+(.+?)(?=\n*(?:##\s*)?3\.)/si },
    { key: "background", regex: /(?:##\s*)?3\.?\s*BACKGROUND\s*\n+(.+?)(?=\n*(?:##\s*)?4\.)/si },
    { key: "summary", regex: /(?:##\s*)?4\.?\s*SUMMARY\s*(?:OF\s*THE\s*INVENTION)?\s*\n+(.+?)(?=\n*(?:##\s*)?5\.)/si },
    { key: "detailed_description", regex: /(?:##\s*)?5\.?\s*DETAILED\s*DESCRIPTION\s*\n+(.+?)(?=\n*(?:##\s*)?6\.)/si },
    { key: "claims", regex: /(?:##\s*)?6\.?\s*CLAIMS\s*\n+(.+?)(?=\n*(?:##\s*)?7\.)/si },
    { key: "abstract", regex: /(?:##\s*)?7\.?\s*ABSTRACT\s*\n+(.+?)(?=\n*(?:##\s*)?8\.)/si },
    { key: "declaration", regex: /(?:##\s*)?8\.?\s*INVENTOR\s*DECLARATION\s*\n+(.+?)$/si }
  ];
  for (const { key, regex } of patterns) {
    const match = text.match(regex);
    sections[key] = match ? match[1].trim() : "";
  }
  if (!sections.title && !sections.claims) {
    sections.raw = text;
    sections.claims = text;
  }
  return sections;
}
__name(parseDisclosureSections, "parseDisclosureSections");
__name2(parseDisclosureSections, "parseDisclosureSections");
__name22(parseDisclosureSections, "parseDisclosureSections");
__name222(parseDisclosureSections, "parseDisclosureSections");
function formatClaims(claimsText) {
  const lines = claimsText.split(/\n/);
  let html2 = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\d+\./.test(trimmed)) {
      html2 += `<div class="claim"><strong>${escapeHtml(trimmed)}</strong></div>
`;
    } else {
      html2 += `<div class="claim">${escapeHtml(trimmed)}</div>
`;
    }
  }
  return html2 || escapeHtml(claimsText);
}
__name(formatClaims, "formatClaims");
__name2(formatClaims, "formatClaims");
__name22(formatClaims, "formatClaims");
__name222(formatClaims, "formatClaims");
function generateHtmlDocument({ submissionId, title, inventorName, inventorEmail, sections, date }) {
  const esc = escapeHtml;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>US Provisional Disclosure \u2014 ${esc(title)}</title>
<style>
  body{font-family:'Segoe UI',system-ui,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#1a1a2e;line-height:1.7}
  h1{font-size:1.5rem;border-bottom:3px solid #4f46e5;padding-bottom:10px}
  h2{font-size:1.1rem;color:#4f46e5;margin-top:24px}
  .meta{background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0;font-size:.9rem}
  .section{background:#fefefe;border:1px solid #e5e7eb;padding:20px 24px;border-radius:8px;margin:16px 0;white-space:pre-wrap;line-height:1.8}
  .claims .claim{margin:8px 0;padding:6px 0;border-bottom:1px dotted #e5e7eb}
  .footer{font-size:.75rem;color:#9ca3af;margin-top:40px;border-top:1px solid #e5e7eb;padding-top:16px}
  .watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-25deg);font-size:6rem;color:rgba(79,70,229,.03);pointer-events:none;z-index:-1;white-space:nowrap}
  @media print{.watermark{display:none}body{font-size:11pt}}
</style>
</head>
<body>
<div class="watermark">DRAFT</div>
<h1>UNITED STATES PROVISIONAL PATENT DISCLOSURE</h1>
<div class="meta">
  <p><strong>Submission ID:</strong> ${esc(submissionId)}</p>
  <p><strong>Date Generated:</strong> ${esc(date)}</p>
  <p><strong>Inventor:</strong> ${esc(inventorName || "Not provided")}</p>
  <p><strong>Contact:</strong> ${esc(inventorEmail || "Not provided")}</p>
  <p><strong>Status:</strong> DRAFT \u2014 Not yet filed with USPTO</p>
</div>
<h2>1. Title of Invention</h2>
<p>${esc(title)}</p>
${sections.technical_field ? `<h2>2. Technical Field</h2><div class="section">${esc(sections.technical_field)}</div>` : ""}
${sections.background ? `<h2>3. Background</h2><div class="section">${esc(sections.background)}</div>` : ""}
${sections.summary ? `<h2>4. Summary of the Invention</h2><div class="section">${esc(sections.summary)}</div>` : ""}
${sections.detailed_description ? `<h2>5. Detailed Description</h2><div class="section">${esc(sections.detailed_description)}</div>` : ""}
${sections.claims ? `<h2>6. Claims</h2><div class="section claims">${formatClaims(sections.claims)}</div>` : ""}
${sections.abstract ? `<h2>7. Abstract</h2><div class="section">${esc(sections.abstract)}</div>` : ""}
${sections.declaration ? `<h2>8. Inventor Declaration</h2><div class="section">${esc(sections.declaration)}</div>` : ""}
<h2>Next Steps</h2>
<ol>
  <li>Review and refine this disclosure carefully</li>
  <li>Add drawings, diagrams, or schematics to support the claims</li>
  <li>File as USPTO provisional application (Forms SB/16, specification, drawings, fee)</li>
  <li>Consult a registered patent attorney or agent before filing</li>
</ol>
<div class="footer">
  <p>Generated by ipatent.me \u2014 AI-Powered US Provisional Disclosure Tool</p>
  <p>This is NOT a filed patent application. No USPTO filing date has been established.</p>
  <p>Generated: ${esc(date)} | Submission ID: ${esc(submissionId)}</p>
</div>
</body>
</html>`;
}
__name(generateHtmlDocument, "generateHtmlDocument");
__name2(generateHtmlDocument, "generateHtmlDocument");
__name22(generateHtmlDocument, "generateHtmlDocument");
__name222(generateHtmlDocument, "generateHtmlDocument");
async function handleDraft(request, env, ctx) {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const title = sanitize(body.title, 300);
  const technicalField = sanitize(body.technical_field, 300);
  const description = sanitize(body.description, MAX_DESCRIPTION_LEN);
  const inventorName = sanitize(body.inventor_name, 200);
  const inventorEmail = sanitize(body.inventor_email, 200);
  if (!title || !description || description.length < 50) {
    return json({ error: "title and description (min 50 chars) are required" }, 400);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateLimit = await checkRateLimit(env, ip);
  if (!rateLimit.allowed) {
    return json({ error: "Rate limit exceeded. Please try again later.", rate_limit: rateLimit }, 429);
  }
  const searchQuery = `${title} ${technicalField} ${description.slice(0, 1e3)}`;
  const ragContext = await searchDisclosures(env, searchQuery);
  const topRag = ragContext && ragContext.length ? ragContext[0] : null;
  const priorArt = topRag && Number(topRag.score) >= 0.8 ? { flag: true, top_title: topRag.title, top_score: Math.round(Number(topRag.score) * 100) / 100, section: topRag.section || "", message: "Very close to an existing corpus filing - refine the distinguishing features before filing." } : null;
  let sections;
  try {
    sections = await draftDisclosure(env, { title, technicalField, description, ragContext });
  } catch (err) {
    return json({ error: "AI drafting failed: " + err.message }, 500);
  }
  const submissionId = generateId();
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const documentHtml = generateHtmlDocument({ submissionId, title, inventorName, inventorEmail, sections, date: now });
  const disclosureText = [
    sections.title,
    sections.technical_field,
    sections.background,
    sections.summary,
    sections.detailed_description,
    sections.claims,
    sections.abstract
  ].filter(Boolean).join("\n\n");
  const r2Key = "disclosures/" + submissionId + ".html";
  const ua = (request.headers.get("User-Agent") || "").slice(0, 500);
  const country = request.headers.get("CF-IPCountry") || "XX";
  const sessionId = crypto.randomUUID();
  try {
    await env.IPATENT_DB.prepare(`
      INSERT INTO submissions (submission_id, inventor_name, inventor_email, title,
        disclosure_text, document_html, r2_key, status, ip_address, user_agent, country,
        session_id, technical_field, abstract, claims, summary, background)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'draft', ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
    `).bind(
      submissionId,
      inventorName,
      inventorEmail,
      title,
      disclosureText,
      documentHtml,
      r2Key,
      ip,
      ua,
      country,
      sessionId,
      sections.technical_field || null,
      sections.abstract || null,
      sections.claims || null,
      sections.summary || null,
      sections.background || null
    ).run();
  } catch (err) {
    console.error("D1 insert failed:", err.message);
  }
  if (env.IPATENT_R2) {
    ctx?.waitUntil?.(
      env.IPATENT_R2.put(r2Key, documentHtml, { httpMetadata: { contentType: "text/html" } }).catch((err) => console.error("R2 put failed:", err.message))
    );
  }
  return json({
    submission_id: submissionId,
    title,
    sections,
    document_html: documentHtml,
    rag_sources: ragContext.map((r) => ({ title: r.title, score: r.score, section: r.section })),
    prior_art: priorArt,
    rate_limit: rateLimit
  });
}
__name(handleDraft, "handleDraft");
__name2(handleDraft, "handleDraft");
__name22(handleDraft, "handleDraft");
__name222(handleDraft, "handleDraft");
async function handleSearch(env, url) {
  const q = url.searchParams.get("q") || url.searchParams.get("query");
  if (!q || q.trim().length < 2) return json({ error: "Missing query parameter (q or query)" }, 400);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 20);
  const results = await searchDisclosures(env, q.trim(), limit);
  return json({ query: q.trim(), count: results.length, results });
}
__name(handleSearch, "handleSearch");
__name2(handleSearch, "handleSearch");
__name22(handleSearch, "handleSearch");
__name222(handleSearch, "handleSearch");
async function handleDisclosures(env, url) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const rows = await env.IPATENT_DB.prepare(
    "SELECT submission_id, title, inventor_name, technical_field, status, created_at FROM submissions ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
  ).bind(limit, offset).all();
  return json({ count: rows.results?.length || 0, offset, limit, disclosures: rows.results || [] });
}
__name(handleDisclosures, "handleDisclosures");
__name2(handleDisclosures, "handleDisclosures");
__name22(handleDisclosures, "handleDisclosures");
__name222(handleDisclosures, "handleDisclosures");
async function handleSubmission(env, id) {
  const row = await env.IPATENT_DB.prepare("SELECT * FROM submissions WHERE submission_id = ?1").bind(id).first();
  if (!row) return json({ error: "Submission not found: " + id }, 404);
  return json(row);
}
__name(handleSubmission, "handleSubmission");
__name2(handleSubmission, "handleSubmission");
__name22(handleSubmission, "handleSubmission");
__name222(handleSubmission, "handleSubmission");
async function handleStatus(env) {
  const [subCount, recent] = await Promise.all([
    env.IPATENT_DB.prepare("SELECT COUNT(*) as cnt FROM submissions").first(),
    env.IPATENT_DB.prepare("SELECT submission_id, title, created_at FROM submissions ORDER BY created_at DESC LIMIT 5").all()
  ]);
  return json({
    status: "ok",
    worker: "qnfo-ipatent",
    version: "3.4.2",
    model: AI_DRAFT_MODELS[0],
    embed_model: AI_EMBED_MODEL,
    draft_models: AI_DRAFT_MODELS,
    stats: { total_submissions: subCount?.cnt || 0 },
    recent: recent?.results || [],
    bindings: {
      d1: !!env.IPATENT_DB,
      r2: !!env.IPATENT_R2,
      vz: !!env.DISCLOSURES_VZ,
      ai: !!env.AI
    }
  });
}
__name(handleStatus, "handleStatus");
__name2(handleStatus, "handleStatus");
__name22(handleStatus, "handleStatus");
__name222(handleStatus, "handleStatus");
var FIELD_SUGGESTIONS = [
  "Quantum Computing & Information",
  "Cryptography & Post-Quantum Security",
  "Cryogenic & Semiconductor Electronics",
  "Energy-Efficient & Thermodynamic Computing",
  "Resonant / Analog Signal Processing",
  "Data Encoding & Compression",
  "Materials & Nanofabrication",
  "Topological Computation",
  "Neuromorphic & Neural Hardware",
  "Error Correction & Stabilization",
  "Measurement & Sensing Systems",
  "Control Systems & Feedback",
  "Software Methods & Simulation",
  "Networking & Secure Communication",
  "Power & Thermal Management"
];
var MESSY_FIELD_TOKENS = ["draft", "brutal", "cleanup", "folder", "misc", "uncategorized", "_"];
var FIELD_RULES = [
  ["Cryptography & Post-Quantum Security", /qkd|key distribution|bb84|quantum key|cryptograph|encrypt|decrypt|post-quantum|breach|security breach/i],
  ["Quantum Computing & Information", /quantum|qubit|qpu|coherence|entangl|superposition|qec|surface code|wave function|state vector|probabilistic states/i],
  ["Resonant / Analog Signal Processing", /harmonic|resonan|oscillat|waveform|spectral|aperiodic|carrier wave|field modulation|radio frequency|rf signal/i],
  ["Topological Computation", /topolog|braid|anyon/i],
  ["Neuromorphic & Neural Hardware", /neuromorph|neural|spiking|brain|synaptic/i],
  ["Cryogenic & Semiconductor Electronics", /cryo|semiconductor|cmos|nanos|fabricat|integrated circuit|substrate|10k-30k|millikelvin/i],
  ["Data Encoding & Compression", /compress|encoding|entropy cod|storage|bitstream|data format/i],
  ["Networking & Secure Communication", /communicat|transmission|wireless|network|modulat|signal transmission/i],
  ["Power & Thermal Management", /thermal|power|energy|heat|efficien/i],
  ["Measurement & Sensing Systems", /measure|sensor|sensing|detect/i],
  ["Control Systems & Feedback", /control|feedback|orchestrat|stabiliz/i],
  ["Error Correction & Stabilization", /error correction|error-correct|fault tolerant/i],
  ["Materials & Nanofabrication", /material|substrate|medium|lattice|nanoparticle|film|engineered medium/i],
  ["Software Methods & Simulation", /simulat|software|algorithm|framework|engine|computer-implemented|method and system|generative/i]
];
function cleanField(title, raw, bodyText) {
  const rl = String(raw || "").toLowerCase();
  const messy = !rl || MESSY_FIELD_TOKENS.some((m) => rl.indexOf(m) >= 0);
  if (!messy) return String(raw || "");
  const t = String(title || "") + " " + String(bodyText || "");
  for (const r of FIELD_RULES) {
    if (r[1].test(t)) return r[0];
  }
  return "Quantum Computing & Information";
}
__name(cleanField, "cleanField");
function decorateIdea(idea) {
  if (!idea || typeof idea !== "object") return idea;
  const clean = cleanField(String(idea.title || ""), String(idea.technical_field || ""), String(idea.description || ""));
  return Object.assign({}, idea, { field_clean: clean, technical_field: clean });
}
__name(decorateIdea, "decorateIdea");
var IDEA_META_CACHE = null;
function ideaMeta() {
  if (IDEA_META_CACHE) return IDEA_META_CACHE;
  IDEA_META_CACHE = (Array.isArray(IDEA_BANK) ? IDEA_BANK : []).map((d, i) => ({
    i,
    title: String(d && d.title || ""),
    technical_field: cleanField(String(d && d.title || ""), String(d && d.technical_field || ""), String(d && d.description || "")),
    field_clean: cleanField(String(d && d.title || ""), String(d && d.technical_field || ""), String(d && d.description || "")),
    focus: String(d && d.description || "").replace(/\s+/g, " ").slice(0, 160)
  })).filter((m) => m.title && m.title.length > 3);
  return IDEA_META_CACHE;
}
__name(ideaMeta, "ideaMeta");
function fieldPrefixes(field) {
  const f = String(field || "").trim().toLowerCase();
  if (!f) return FIELD_SUGGESTIONS.slice(0, 6);
  const out = FIELD_SUGGESTIONS.filter((x) => {
    const xl = x.toLowerCase();
    return xl.indexOf(f) === 0 || xl.split(" & ")[0].toLowerCase().indexOf(f) === 0 || xl.indexOf(f) > 0;
  });
  return out.slice(0, 6);
}
__name(fieldPrefixes, "fieldPrefixes");
async function handleSuggest(env, url) {
  const q = (url.searchParams.get("q") || "").trim().slice(0, 300);
  const field = (url.searchParams.get("field") || "").trim().slice(0, 80);
  const out = { q, field, policy: "ip-domain only; grounded in the iPATENT corpus; personal/ops actions are never suggested" };
  out.fields = fieldPrefixes(field);
  const meta = ideaMeta();
  const examples = [];
  if (meta.length) {
    const day = Math.floor(Date.now() / 864e5);
    const step = Math.max(1, Math.floor(meta.length / 4));
    for (let k = 0; k < 4 && k < meta.length; k++) examples.push(meta[(day + k * step) % meta.length]);
  }
  out.examples = examples;
  if (q.length >= 3) {
    const sim = await searchDisclosures(env, q, 5);
    out.similar = (sim || []).map((x) => ({
      title: x.title,
      section: x.section,
      technical_field: x.technical_field,
      field_clean: cleanField(String(x.title || ""), String(x.technical_field || ""), String(x.disclosure_text || "")),
      score: Math.round((Number(x.score) || 0) * 100) / 100,
      source_file: x.source_file,
      snippet: String(x.disclosure_text || "").replace(/\s+/g, " ").slice(0, 180)
    }));
  }
  return json(out);
}
__name(handleSuggest, "handleSuggest");
var LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>iPatent \u2014 Inventor Disclosure Assistant \xB7 qnfo.org</title>
<meta name="description" content="Draft a US provisional patent disclosure in minutes. Free AI drafting grounded in a corpus of real filings \u2014 powered by ipatent.qnfo.org.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --paper:#f6f3ea;
    --paper-deep:#efeadd;
    --ink:#16181d;
    --ink-soft:#4a4d55;
    --green:#0e5c3f;
    --green-bright:#16784f;
    --amber:#a97b1d;
    --line:#d8d2c2;
    --white:#fffdf8;
    --danger:#9a2f2f;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{
    font-family:'Fraunces',Georgia,serif;
    background:var(--paper);
    color:var(--ink);
    line-height:1.6;
    -webkit-font-smoothing:antialiased;
  }
  /* paper grain */
  body::before{
    content:"";
    position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0.05 0 0 0 0 0.06 0 0 0 0 0.05 0 0 0 0.04 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .wrap{position:relative;z-index:1;max-width:1080px;margin:0 auto;padding:0 28px}

  /* ===== Docket header ===== */
  .docket{
    border-bottom:1px solid var(--line);
    padding:22px 0;
    display:flex;justify-content:space-between;align-items:center;
  }
  .docket .brand{display:flex;align-items:center;gap:14px}
  .seal{
    width:46px;height:46px;border-radius:50%;
    border:2px solid var(--green);color:var(--green);
    display:grid;place-items:center;
    font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:1px;font-weight:600;
    background:radial-gradient(circle at 30% 30%, var(--paper-deep), transparent 70%);
    animation:sealIn 1s cubic-bezier(.2,.8,.2,1) both;
  }
  @keyframes sealIn{from{transform:rotate(-120deg) scale(.4);opacity:0}to{transform:rotate(0) scale(1);opacity:1}}
  .docket .brand .name{font-size:20px;font-weight:600;letter-spacing:-.01em}
  .docket .brand .name em{font-style:normal;color:var(--green)}
  .docket .meta{
    font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink-soft);
    text-align:right;line-height:1.7;letter-spacing:.03em;
  }
  .docket .meta b{color:var(--green);font-weight:600}

  /* ===== Hero ===== */
  .hero{padding:72px 0 40px;text-align:center;position:relative}
  .hero .kicker{
    font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.22em;
    text-transform:uppercase;color:var(--green);margin-bottom:22px;
    animation:rise .7s .1s both;
  }
  .hero h1{
    font-size:clamp(40px,7vw,72px);font-weight:600;line-height:1.04;letter-spacing:-.02em;
    animation:rise .7s .2s both;
  }
  .hero h1 .amp{font-style:italic;color:var(--amber);font-weight:500}
  .hero .sub{
    max-width:620px;margin:26px auto 0;font-size:19px;color:var(--ink-soft);font-weight:400;
    animation:rise .7s .3s both;
  }
  @keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
  .chips{
    display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:30px;
    animation:rise .7s .4s both;
  }
  .chip{
    font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.06em;
    border:1px solid var(--line);border-radius:999px;padding:8px 16px;color:var(--ink-soft);
    background:var(--white);display:inline-flex;align-items:center;gap:8px;
    transition:border-color .2s,color .2s,transform .2s;
  }
  .chip:hover{border-color:var(--green);color:var(--green);transform:translateY(-2px)}
  .chip::before{content:"\u25C6";font-size:8px;color:var(--green)}

  /* ===== Form (filing style) ===== */
  .form-card{
    background:var(--white);
    border:1px solid var(--line);
    box-shadow:0 24px 60px -30px rgba(22,24,29,.25);
    margin:36px 0 24px;
    position:relative;
    animation:rise .7s .5s both;
  }
  .form-card::before{
    content:"";position:absolute;left:0;top:0;bottom:0;width:4px;
    background:linear-gradient(var(--green),var(--amber));
  }
  .form-head{
    display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;
    padding:20px 28px;border-bottom:1px solid var(--line);
    font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);
  }
  .form-head .form-no{color:var(--green);font-weight:600}
  .form-head .form-no::before{content:"NO. ";color:var(--ink-soft)}
  form{padding:28px 28px 8px}
  .field{margin-bottom:22px}
  .field label{
    display:block;font-family:'IBM Plex Mono',monospace;font-size:11px;
    letter-spacing:.08em;text-transform:uppercase;color:var(--green);
    margin-bottom:8px;font-weight:600;
  }
  .field label .num{color:var(--amber);margin-right:8px}
  .field input,.field textarea{
    width:100%;background:transparent;border:none;border-bottom:1.5px solid var(--line);
    font-family:'Fraunces',serif;font-size:17px;color:var(--ink);padding:8px 2px;
    transition:border-color .2s;resize:vertical;
  }
  .field input:focus,.field textarea:focus{outline:none;border-bottom-color:var(--green)}
  .field textarea{min-height:120px;line-height:1.55}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:24px}
  @media(max-width:640px){.row{grid-template-columns:1fr}}
  .actions{padding:8px 28px 26px}
  .actions-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(max-width:560px){.actions-row{grid-template-columns:1fr}}
  .invent{
    background:var(--white);color:var(--green);border:1.5px solid var(--green);
    width:100%;padding:16px;font-family:'IBM Plex Mono',monospace;font-size:13px;
    letter-spacing:.14em;text-transform:uppercase;font-weight:600;cursor:pointer;
    transition:background .2s,color .2s,transform .2s;
  }
  .invent:hover{background:var(--paper-deep);transform:translateY(-1px)}
  .invent:disabled{opacity:.55;cursor:wait;transform:none}
  button[type=submit]{
    width:100%;padding:16px;font-family:'IBM Plex Mono',monospace;font-size:13px;
    letter-spacing:.14em;text-transform:uppercase;font-weight:600;cursor:pointer;
    background:var(--green);color:var(--white);border:1.5px solid var(--green);
    transition:background .2s,color .2s,transform .2s;position:relative;
  }
  button[type=submit]:hover{background:var(--green-bright);transform:translateY(-1px)}
  button[type=submit]:disabled{opacity:.55;cursor:wait;transform:none}
  .status{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--ink-soft);margin-top:12px;min-height:18px}
  .status.err{color:var(--danger)}
  .note{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ink-soft);margin-top:14px;line-height:1.6}
  .note b{color:var(--green)}

  /* ===== Results: printed disclosure ===== */
  #result{display:none;margin:36px 0}
  .result-head{
    display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;
    margin-bottom:14px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em;
    text-transform:uppercase;color:var(--green);
  }
  .paper{
    position:relative;background:var(--white);border:1px solid var(--line);
    padding:44px 40px;box-shadow:0 20px 50px -30px rgba(22,24,29,.3);
  }
  .paper .wm{
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-24deg);
    font-size:110px;font-weight:700;color:rgba(14,92,63,.045);pointer-events:none;letter-spacing:.04em;
    white-space:nowrap;
  }
  .paper .pno{
    font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--amber);
    text-transform:uppercase;margin-bottom:18px;
  }
  .paper h3{
    font-size:15px;font-family:'IBM Plex Mono',monospace;letter-spacing:.06em;
    text-transform:uppercase;color:var(--green);margin:26px 0 8px;font-weight:600;
  }
  .paper h3:first-child{margin-top:0}
  .paper .sec{white-space:pre-wrap;font-size:15.5px;line-height:1.75;color:var(--ink)}
  .paper .claim{padding:7px 0;border-bottom:1px dotted var(--line);font-size:15px;line-height:1.6}
  .paper .claim:last-child{border-bottom:none}
  .src{
    margin-top:26px;padding-top:18px;border-top:1px solid var(--line);
    font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink-soft);
  }
  .src b{color:var(--green)}
  .src .src-row{margin:4px 0}

  /* ===== How it works ===== */
  .how{padding:64px 0 20px}
  .how h2{
    font-size:30px;font-weight:600;text-align:center;margin-bottom:40px;letter-spacing:-.01em;
  }
  .how h2 span{color:var(--green)}
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
  @media(max-width:760px){.steps{grid-template-columns:1fr}}
  .step{
    border:1px solid var(--line);background:var(--white);padding:26px 24px;position:relative;
    transition:transform .25s,box-shadow .25s;
  }
  .step:hover{transform:translateY(-4px);box-shadow:0 18px 40px -26px rgba(14,92,63,.35)}
  .step .sno{
    font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--amber);letter-spacing:.1em;
    margin-bottom:12px;
  }
  .step h3{font-size:19px;font-weight:600;margin-bottom:8px}
  .step p{font-size:14.5px;color:var(--ink-soft)}

  /* ===== Footer ===== */
  footer{border-top:1px solid var(--line);margin-top:70px;padding:36px 0 44px}
  .foot{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
  .foot .f-brand{font-weight:600;font-size:17px}
  .foot .f-brand em{font-style:normal;color:var(--green)}
  .foot nav{display:flex;gap:22px;font-size:14px;font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.04em}
  .foot nav a{color:var(--ink-soft);text-decoration:none;border-bottom:1px solid transparent;transition:color .2s,border-color .2s}
  .foot nav a:hover{color:var(--green);border-bottom-color:var(--green)}
  .foot .f-legal{width:100%;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ink-soft);line-height:1.7;margin-top:26px}
    /* ===== Adaptive starters + guidance (v3.4) ===== */
  .suggest{margin:4px 0 2px}
  .sug-head{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--green);margin:18px 0 8px;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
  .sug-head span{color:var(--ink-soft);text-transform:none;letter-spacing:.01em;font-family:'Fraunces',Georgia,serif;font-size:12.5px;font-weight:400}
  .sug-chips{display:flex;flex-wrap:wrap;gap:8px}
  .sug-chip{font-family:'IBM Plex Mono',monospace;font-size:10.5px;border:1px solid var(--line);background:var(--white);color:var(--ink);border-radius:999px;padding:6px 12px;cursor:pointer;max-width:100%;text-align:left;transition:border-color .15s,color .15s}
  .sug-chip:hover{border-color:var(--green);color:var(--green)}
  .sug-empty{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ink-soft)}
  .guide{border-left:2px solid var(--green);background:rgba(14,92,63,.04);padding:8px 12px;margin-top:4px}
  .g-empty{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--ink-soft)}
  .g-row{font-size:13px;padding:5px 0;border-bottom:1px dotted var(--line);display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
  .g-row:last-child{border-bottom:none}
  .g-t{color:var(--ink)}
  .g-pct{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--amber)}
  .g-note{margin-top:6px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:var(--ink-soft)}
    .close-warn{display:none;margin:0 0 18px;border:1px solid var(--amber);border-left:4px solid var(--amber);background:rgba(169,123,29,.08);padding:12px 14px;font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:1.65;color:var(--ink)}
  .close-warn b{color:var(--amber);letter-spacing:.06em}
@media print{.docket,.hero,.chips,.actions,.status,.how,footer,.suggest{display:none}.form-card{box-shadow:none}}
</style>
</head>
<body>
<div class="wrap">
  <!-- Docket header -->
  <header class="docket">
    <div class="brand">
      <div class="seal">IPATENT</div>
      <div class="name">iPatent<em>.</em>qnfo.org</div>
    </div>
    <div class="meta">
      <div>INVENTOR DISCLOSURE ASSISTANT</div>
      <div>DOCKET <b>QNFO-IP-2026</b> \xB7 STATUS <b>OPEN</b></div>
    </div>
  </header>

  <!-- Hero -->
  <section class="hero">
    <div class="kicker">Free \xB7 US Provisional Patent Drafting \xB7 Grounded in real filings</div>
    <h1>Turn your idea into a<br><span class="amp">defensible</span> disclosure.</h1>
    <p class="sub">Describe your invention. iPatent drafts a complete US provisional disclosure \u2014 title, field, background, summary, detailed description, claims and abstract \u2014 in USPTO style, informed by a corpus of actual patent filings.</p>
    <div class="chips">
      <span class="chip">33,500+ filing segments in the knowledge base</span>
      <span class="chip">Free AI \xB7 zero-cost at scale</span>
      <span class="chip">8-section USPTO format</span>
    </div>
  </section>

  <!-- Filing form -->
  <section class="form-card" id="draft">
    <div class="form-head">
      <span class="form-no">1 / INVENTOR INPUT</span>
      <span>ALL FIELDS OPTIONAL EXCEPT TITLE &amp; DESCRIPTION</span>
    </div>
    <form id="draftForm">
      <div class="field">
        <label for="title"><span class="num">1.</span>Title of Invention *</label>
        <input id="title" name="title" placeholder="e.g. Quantum-Resistant Cryptographic Accelerator" required>
      </div>
      <div class="field">
        <label for="technicalField"><span class="num">2.</span>Technical Field <span style="color:var(--ink-soft);text-transform:none;letter-spacing:0">(optional)</span></label>
        <input id="technicalField" name="technical_field" placeholder="e.g. Cryptography, Quantum Computing" list="fieldOptions" autocomplete="off">
        <datalist id="fieldOptions">
          <option value="Quantum Computing &amp; Information">
          <option value="Cryptography &amp; Post-Quantum Security">
          <option value="Cryogenic &amp; Semiconductor Electronics">
          <option value="Energy-Efficient &amp; Thermodynamic Computing">
          <option value="Resonant / Analog Signal Processing">
          <option value="Data Encoding &amp; Compression">
          <option value="Materials &amp; Nanofabrication">
          <option value="Topological Computation">
          <option value="Neuromorphic &amp; Neural Hardware">
          <option value="Error Correction &amp; Stabilization">
          <option value="Measurement &amp; Sensing Systems">
          <option value="Control Systems &amp; Feedback">
          <option value="Software Methods &amp; Simulation">
          <option value="Networking &amp; Secure Communication">
          <option value="Power &amp; Thermal Management">
        </datalist>
      </div>
      <div class="field">
        <label for="description"><span class="num">3.</span>Description of the Invention *</label>
        <textarea id="description" name="description" placeholder="What is your invention? What problem does it solve? How does it work \u2014 components, mechanism, key novelty?" required></textarea>
      </div>
            <div class="suggest" id="starterZone">
        <div class="sug-head">STARTERS <span>&mdash; corpus examples. Pick one to load, then improve it before drafting.</span></div>
        <div class="sug-chips" id="starterChips"><span class="sug-empty">Loading corpus examples&hellip;</span></div>
        <div class="sug-head" id="guideHead" style="display:none">WHILE YOU TYPE <span>&mdash; closest corpus filings, for style grounding</span></div>
        <div id="typeGuide" class="guide"><div class="g-empty">As you describe an invention, similar corpus filings will appear here.</div></div>
      </div>
<div class="row">
        <div class="field">
          <label for="inventorName"><span class="num">4.</span>Inventor Name <span style="color:var(--ink-soft);text-transform:none;letter-spacing:0">(optional)</span></label>
          <input id="inventorName" name="inventor_name" placeholder="Full name">
        </div>
        <div class="field">
          <label for="inventorEmail"><span class="num">5.</span>Email <span style="color:var(--ink-soft);text-transform:none;letter-spacing:0">(optional)</span></label>
          <input id="inventorEmail" name="inventor_email" type="email" placeholder="you@example.com">
        </div>
      </div>
      <div class="actions">
        <div class="actions-row">
          <button type="submit" id="generateBtn">Draft Disclosure</button>
          <button type="button" id="inventBtn" class="invent" title="Pick a real invention concept from the corpus and draft it">\u26A1 Invent Something</button>
        </div>
        <div class="status" id="status"></div>
        <div class="note"><b>Good practice:</b> include components, operating principle, and at least one alternative embodiment. Rate-limited to 20 drafts/hour per IP. <b>DRAFT ONLY</b> \u2014 not legal advice; consult a registered patent attorney before filing.</div>
      </div>
    </form>
  </section>

  <!-- Result -->
  <section id="result">
    <div class="result-head">
      <span>DRAFT DISCLOSURE \xB7 FOR REVIEW</span>
      <span id="resultId"></span>
    </div>
    <div class="close-warn" id="closeWarn" style="display:none"></div>
    <div class="paper">
      <div class="wm">DRAFT</div>
      <div class="pno">UNITED STATES PROVISIONAL PATENT DISCLOSURE \xB7 SUBMISSION DRAFT</div>
      <div id="resultContent"></div>
      <div class="src" id="ragSources"></div>
    </div>
  </section>

  <!-- How it works -->
  <section class="how">
    <h2>How it <span>works</span></h2>
    <div class="steps">
      <div class="step">
        <div class="sno">STEP 01 \u2014 RETRIEVE</div>
        <h3>Ground in prior filings</h3>
        <p>Your description is matched against 33,500+ semantic segments from the real QNFO/QWAV patent corpus \u2014 so the draft reflects proven disclosure structure.</p>
      </div>
      <div class="step">
        <div class="sno">STEP 02 \u2014 DRAFT</div>
        <h3>Reason like a patent drafter</h3>
        <p>deepseek-r1 (free) writes all eight sections in formal USPTO register, with claims in standard dependent/independent format.</p>
      </div>
      <div class="step">
        <div class="sno">STEP 03 \u2014 OWN</div>
        <h3>Export and file</h3>
        <p>Your draft is stored under a unique submission ID and rendered as a clean HTML document you can save, print, and take to a practitioner.</p>
      </div>
    </div>
  </section>

  <footer>
    <div class="foot">
      <div class="f-brand">iPatent<em>.</em>qnfo.org <span style="font-weight:400;color:var(--ink-soft)">\xB7 an open research project</span></div>
      <nav>
        <a href="https://qnfo.org">QNFO</a>
        <a href="https://qwav.org">QWAV</a>
        <a href="https://archive.qnfo.org">Archive</a>
        <a href="https://qnfo.org/legal">License</a>
      </nav>
      <div class="f-legal">
        iPatent is a free experimental drafting assistant. Outputs are machine-generated drafts \u2014 not legal advice, and not filed applications.
        No USPTO filing date is established by generation. \xA9 2026 QNFO Research Foundation.
      </div>
    </div>
  </footer>
</div>

<script>
(function(){
  const form = document.getElementById('draftForm');
  const btn = document.getElementById('generateBtn');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  const rc = document.getElementById('resultContent');
  const rag = document.getElementById('ragSources');
  // API base: works from both ipatent.qnfo.org and qnfo.org/ipatent
  const API_BASE = location.pathname.startsWith('/ipatent') ? '/ipatent/api' : '/api';

  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  function renderSections(s){
    const blocks = [
      ['1. TITLE OF INVENTION', s.title],
      ['2. TECHNICAL FIELD', s.technical_field],
      ['3. BACKGROUND', s.background],
      ['4. SUMMARY OF THE INVENTION', s.summary],
      ['5. DETAILED DESCRIPTION', s.detailed_description],
      ['6. CLAIMS', s.claims],
      ['7. ABSTRACT', s.abstract],
      ['8. INVENTOR DECLARATION', s.declaration]
    ];
    return blocks.filter(([,v])=>v).map(([h,v])=>{
      if(h.startsWith('6.')){
        const claims = String(v).split(/\\n/).filter(l=>l.trim()).map(l=>'<div class="claim">'+esc(l)+'</div>').join('');
        return '<h3>'+h+'</h3><div>'+claims+'</div>';
      }
      return '<h3>'+h+'</h3><div class="sec">'+esc(v)+'</div>';
    }).join('');
  }

  function renderRag(sources){
    if(!sources || !sources.length) return '<b>REFERENCE FILINGS:</b> none matched (corpus may still be warming).';
    const rows = sources.slice(0,6).map(s=>
      '<div class="src-row">\u25C6 <b>'+esc(s.title)+'</b> \u2014 similarity '+ (s.score*100).toFixed(0)+'% \xB7 section: '+esc(s.section)+'</div>'
    ).join('');
    return '<b>REFERENCE FILINGS RETRIEVED:</b>'+rows;
  }

  // ==== Adaptive starters + type-ahead corpus guidance (v3.4) ====
  function loadStarters(){
    fetch(API_BASE + '/suggest').then(function(r){return r.json();}).then(function(d){
      var zone = document.getElementById('starterChips');
      if(!zone) return;
      var ex = (d && d.examples) || [];
      zone.innerHTML = '';
      if(!ex.length){ zone.innerHTML = '<span class="sug-empty">No corpus examples yet.</span>'; return; }
      ex.forEach(function(m){
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sug-chip';
        var t = m.title || 'Example';
        b.textContent = t.length > 60 ? t.slice(0,60) + '...' : t;
        var tf = m.field_clean || m.technical_field || '';
        b.title = (tf ? tf + ' / ' : '') + (m.focus || '');
        b.addEventListener('click', function(){ applyExample(m.i); });
        zone.appendChild(b);
      });
    }).catch(function(){});
  }
  function applyExample(i){
    fetch(API_BASE + '/idea?i=' + encodeURIComponent(i)).then(function(r){return r.json();}).then(function(idea){
      if(!idea || !idea.title) throw new Error('no idea returned');
      document.getElementById('title').value = idea.title || '';
      document.getElementById('technicalField').value = idea.field_clean || idea.technical_field || '';
      document.getElementById('description').value = idea.description || '';
      var st = document.getElementById('status');
      if(st){ st.className = 'status'; st.textContent = 'Loaded a corpus example - edit it before drafting.'; }
    }).catch(function(err){
      var st = document.getElementById('status');
      if(st){ st.className = 'status err'; st.textContent = 'Could not load example: ' + err.message; }
    });
  }
  var guideTimer = null;
  function loadGuidance(){
    var t = (document.getElementById('title').value || '').trim();
    var d = (document.getElementById('description').value || '').trim();
    var f = (document.getElementById('technicalField').value || '').trim();
    var q = (f ? f + ' ' : '') + (t ? t + ' ' : '') + d;
    var box = document.getElementById('typeGuide');
    if(!box) return;
    if(q.length < 3){ box.innerHTML = '<div class="g-empty">As you describe an invention, similar corpus filings will appear here.</div>'; return; }
    fetch(API_BASE + '/suggest?q=' + encodeURIComponent(q.slice(0,300))).then(function(r){return r.json();}).then(function(d2){
      var sim = (d2 && d2.similar) || [];
      var head = document.getElementById('guideHead');
      if(head) head.style.display = sim.length ? '' : 'none';
      if(!sim.length){ box.innerHTML = '<div class="g-empty">No close corpus filings matched yet - keep adding detail.</div>'; return; }
      var h = '';
      sim.slice(0,4).forEach(function(m){
        var pct = Math.round((Number(m.score) || 0) * 100);
        var sec = m.section ? ' / ' + m.section : '';
        h += '<div class="g-row"><span class="g-t"><b>' + esc(m.title || '') + '</b>' + esc(sec) + ' <span class="g-pct">' + pct + '%</span></span></div>';
      });
      box.innerHTML = h + '<div class="g-note">Corpus filings are style references - drafts are written fresh from your description.</div>';
    }).catch(function(){});
  }
  ['title','description','technicalField'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('input', function(){ if(guideTimer) clearTimeout(guideTimer); guideTimer = setTimeout(loadGuidance, 400); });
  });
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'DRAFTING\u2026 (up to ~90s)';
    status.textContent = '';
    status.className = 'status';
    result.style.display = 'none';
    try{
      const resp = await fetch(API_BASE + '/draft', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          title: document.getElementById('title').value.trim(),
          technical_field: document.getElementById('technicalField').value.trim(),
          description: document.getElementById('description').value.trim(),
          inventor_name: document.getElementById('inventorName').value.trim(),
          inventor_email: document.getElementById('inventorEmail').value.trim()
        })
      });
      const data = await resp.json();
      if(!resp.ok){
        status.className = 'status err';
        status.textContent = 'Error: ' + (data.error || resp.status);
        return;
      }
      result.style.display = 'block';
      document.getElementById('resultId').textContent = 'SUBMISSION ' + data.submission_id;
      rc.innerHTML = renderSections(data.sections||{});
      rag.innerHTML = renderRag(data.rag_sources||[]);
      var cw = document.getElementById('closeWarn');
      if(cw){
        if(data.prior_art && data.prior_art.flag){
          cw.style.display = 'block';
          cw.innerHTML = '<b>PRIOR-ART CLOSENESS WARNING</b> &mdash; your description is very close to &ldquo;' + esc(data.prior_art.top_title || '') + '&rdquo; (' + Math.round((Number(data.prior_art.top_score) || 0) * 100) + '% similar, section ' + esc(data.prior_art.section || 'n/a') + '). ' + esc(data.prior_art.message || 'Refine the distinguishing features before filing.') + ' This is a style/prior-art reference, not a clearance opinion.';
        } else { cw.style.display = 'none'; }
      }
      status.textContent = 'Draft generated \xB7 submission ' + data.submission_id;
      document.getElementById('result').scrollIntoView({behavior:'smooth'});
    }catch(err){
      status.className = 'status err';
      status.textContent = 'Network error: ' + err.message;
    }finally{
      btn.disabled = false;
      btn.textContent = 'Draft Disclosure';
      const ib = document.getElementById('inventBtn');
      if(ib){ ib.disabled = false; ib.textContent = '\u26A1 Invent Something'; }
    }
  });

  // ==== "Invent Something" (I'm Feeling Lucky) \u2014 pick a real corpus concept + auto-draft ====
  document.getElementById('inventBtn').addEventListener('click', async ()=>{
    const inventBtn = document.getElementById('inventBtn');
    inventBtn.disabled = true;
    inventBtn.textContent = 'INVENTING\u2026';
    status.textContent = 'Picking an invention concept from the corpus\u2026';
    status.className = 'status';
    try{
      const resp = await fetch(API_BASE + '/idea');
      const idea = await resp.json();
      if(!resp.ok || !idea.title) throw new Error(idea.error || ('HTTP ' + resp.status));
      document.getElementById('title').value = idea.title;
      document.getElementById('technicalField').value = idea.field_clean || idea.technical_field || '';
      document.getElementById('description').value = idea.description;
      status.textContent = 'Invented: "' + idea.title.slice(0,60) + '" \u2014 drafting disclosure\u2026';
      form.dispatchEvent(new Event('submit', {cancelable:true}));
    }catch(err){
      status.className = 'status err';
      status.textContent = 'Error: ' + err.message;
      inventBtn.disabled = false;
      inventBtn.textContent = '\u26A1 Invent Something';
    }
  });
  loadStarters();
})();
<\/script>
</body>
</html>
`;
var qnfo_ipatent_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let path = url.pathname;
    if (path === "/ipatent" || path.startsWith("/ipatent/")) path = path.slice("/ipatent".length) || "/";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    try {
      if (path === "/health") {
        return json({
          status: "ok",
          worker: "qnfo-ipatent",
          version: "3.4.2",
          bindings: {
            d1: !!env.IPATENT_DB ? "ipatent-db" : null,
            r2: !!env.IPATENT_R2 ? "ipatent" : null,
            vz: !!env.DISCLOSURES_VZ ? "ipatent-corpus" : null,
            ai: !!env.AI
          }
        });
      }
      if (path === "/" && request.method === "GET") return html(LANDING_HTML);
      if (path === "/api/draft" && request.method === "POST") return handleDraft(request, env, ctx);
      if (path === "/api/search" && request.method === "GET") return handleSearch(env, url);
      if (path === "/api/disclosures" && request.method === "GET") return handleDisclosures(env, url);
      if (path.startsWith("/api/submission/") && request.method === "GET") {
        const id = path.split("/api/submission/")[1];
        if (!id) return json({ error: "Missing submission ID" }, 400);
        return handleSubmission(env, id);
      }
      if (path === "/api/idea" && request.method === "GET") {
        const iParam = url.searchParams.get("i");
        let idea;
        if (iParam !== null && iParam !== "") {
          const idx = parseInt(iParam, 10);
          if (!Number.isFinite(idx) || idx < 0 || idx >= (Array.isArray(IDEA_BANK) ? IDEA_BANK.length : 0)) return json({ error: "No such example index" }, 404);
          idea = IDEA_BANK[idx];
        } else {
          idea = IDEA_BANK[Math.floor(Math.random() * IDEA_BANK.length)] || IDEA_BANK[0];
        }
        if (!idea) return json({ error: "No idea bank entries" }, 404);
        return json(decorateIdea(idea));
      }
      if (path === "/api/suggest" && request.method === "GET") return handleSuggest(env, url);
      if (path === "/api/status" && request.method === "GET") return handleStatus(env);
      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error("Unhandled error:", err.message, err.stack);
      return json({ error: "Internal server error" }, 500);
    }
  }
};
export {
  qnfo_ipatent_default as default
};
//# sourceMappingURL=worker.js.map
