/* Sample drafts (original text, written for this demo). */
export const SAMPLES: Record<string, { label: string; text: string }> = {
  health: {
    label: 'AI in medicine',
    text: `Artificial intelligence is rapidly changing how diseases are diagnosed. Deep learning models trained on large collections of medical images can now detect diabetic retinopathy in retinal photographs with accuracy comparable to ophthalmologists.

In dermatology, convolutional neural networks have been shown to classify skin cancer from photographs at a level similar to board-certified dermatologists. Radiology has seen similar progress, with algorithms identifying pneumonia and lung nodules on chest X-rays.

However, these systems raise important concerns. Studies have found that algorithms trained on data from one hospital often perform worse when deployed elsewhere, a problem known as dataset shift. Racial bias has also been documented in a widely used commercial algorithm that predicted health care needs from past spending.

Large language models are now being evaluated for clinical tasks such as answering medical licensing exam questions and summarising patient records. Researchers emphasise that careful validation, transparency and human oversight remain essential before such tools are widely adopted in hospitals.`,
  },
  climate: {
    label: 'Urban heat',
    text: `Cities are often several degrees warmer than the surrounding countryside, a phenomenon known as the urban heat island effect. Dark surfaces such as asphalt and roofs absorb solar radiation during the day and release it slowly at night, while the lack of vegetation reduces cooling through evapotranspiration.

The health consequences can be severe. During the 2003 European heat wave, tens of thousands of excess deaths were recorded, with elderly residents in dense urban areas among the most vulnerable.

Several mitigation strategies have been studied. Green roofs and street trees can lower surface temperatures considerably, and reflective "cool roof" coatings reduce the amount of heat buildings absorb. Urban planners are also exploring how the layout of streets and the placement of parks affect airflow and local temperatures.

As climate change increases the frequency of extreme heat events, reducing urban heat has become a priority for public health and city planning worldwide.`,
  },
  history: {
    label: 'The printing press',
    text: `The invention of the movable-type printing press by Johannes Gutenberg around 1440 is widely regarded as one of the most important events of the second millennium. Before printing, books were copied by hand, making them expensive and rare.

Within fifty years of Gutenberg's innovation, printing presses had spread to more than two hundred European cities, and millions of books had been produced. Historians argue that the printing revolution helped spread the ideas of the Renaissance and made the Protestant Reformation possible, as Martin Luther's pamphlets circulated widely across Germany.

The press also transformed science. Standardised printed texts allowed scholars to compare observations, correct errors and build on one another's work, contributing to the Scientific Revolution. Literacy rates rose gradually as printed material became cheaper and more widely available.`,
  },
};
