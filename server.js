const express = require("express");
const multer = require("multer");
const tf = require("@tensorflow/tfjs-node");
const { createCanvas, loadImage } = require("canvas");
const { v4: uuidv4 } = require("uuid");
const savePredictionToFirestore = require("./savePredictionToFirestore");
require("dotenv").config();

const app = express();
const port = 3000;

// Set up multer middleware to handle file uploads with size limit
const upload = multer({
  dest: "uploads/",
});

app.post("/predict", upload.single("image"), async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        status: "fail",
        message: "Terjadi kesalahan dalam melakukan prediksi",
      });
    }

    // Check if file size exceeds limit
    if (req.file.size > 1000000) {
      return res.status(413).json({
        status: "fail",
        message: "Payload content length greater than maximum allowed: 1000000",
      });
    }

    const img = await loadImage(req.file.path);
    const canvas = createCanvas(224, 224); // Resize canvas to match model input shape
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, 224, 224); // Resize the image to fit the canvas

    // Convert the canvas to a TensorFlow tensor
    let tensor = tf.browser.fromPixels(canvas);
    tensor = tensor.toFloat();
    tensor = tensor.expandDims(0); // Add batch dimension

    const model = await tf.loadGraphModel(`${process.env.MODEL_URL}`);
    const output = model.predict(tensor);

    // Convert output to a value between 0 and 1
    const prediction = output.dataSync()[0];
    // Classify output
    const result = prediction > 0.5 ? "Cancer" : "Non-cancer";

    // Save prediction result to Firestore
    const id = uuidv4();
    const data = {
      id,
      result,
      suggestion:
        result == "Cancer"
          ? "Segera periksa ke dokter!"
          : "Atur jadwal pemeriksaan rutin dengan dokter untuk menjaga kesehatan Anda.",
      createdAt: new Date(),
    };
    await savePredictionToFirestore(id, data);

    // Send the classification result as the response
    res.status(201).json({
      status: "success",
      message: "Model is predicted successfully",
      data,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(400).json({
      status: "fail",
      message: "Terjadi kesalahan dalam melakukan prediksi",
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
