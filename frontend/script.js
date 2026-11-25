/*
  Civic360 citizen frontend
  MOCK_MODE = true  -> saves demo complaints in this browser.
  MOCK_MODE = false -> sends requests to your team's FastAPI backend.
*/const MOCK_MODE = false;
const API_BASE_URL = "http://192.168.119.29:8000";
const STORAGE_KEY = "civic360_demo_complaints";

const form = document.getElementById("complaintForm");
const manualLocationInput = document.getElementById("manualLocation");
const locationSuggestions = document.getElementById("locationSuggestions");

let selectedLatitude = null;
let selectedLongitude = null;
let searchTimeout = null;
manualLocationInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);

    selectedLatitude = null;
    selectedLongitude = null;
    locationSuggestions.innerHTML = "";

    const query = manualLocationInput.value.trim();

    if (query.length < 3) return;

    searchTimeout = setTimeout(async () => {
        try {
            const response = await fetch(
                `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`
            );

            const data = await response.json();

            locationSuggestions.innerHTML = "";

            data.features.forEach((place) => {
                const properties = place.properties;
                const coordinates = place.geometry.coordinates;

                const suggestion = document.createElement("div");

                suggestion.textContent = [
                    properties.name,
                    properties.street,
                    properties.city,
                    properties.state
                ].filter(Boolean).join(", ");

                suggestion.style.padding = "12px";
                suggestion.style.cursor = "pointer";
                suggestion.style.borderBottom = "1px solid #ddd";

                suggestion.addEventListener("click", () => {
                    manualLocationInput.value = suggestion.textContent;

                    selectedLongitude = coordinates[0];
                    selectedLatitude = coordinates[1];

                    locationSuggestions.innerHTML = "";
                });

                locationSuggestions.appendChild(suggestion);
            });

        } catch (error) {
            console.error("Location search failed:", error);
        }
    }, 500);
});
const languageInput = document.getElementById("language");
const descriptionInput = document.getElementById("description");
const voiceButton = document.getElementById("voiceButton");
const voiceButtonText = document.getElementById("voiceButtonText");
const voiceStatus = document.getElementById("voiceStatus");
const speechNotice = document.getElementById("speechNotice");
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photoPreview");
const previewImage = document.getElementById("previewImage");
const photoName = document.getElementById("photoName");
const locationButton = document.getElementById("locationButton");
const locationStatus = document.getElementById("locationStatus");
const coordinates = document.getElementById("coordinates");
const latitudeValue = document.getElementById("latitudeValue");
const longitudeValue = document.getElementById("longitudeValue");
const formMessage = document.getElementById("formMessage");
const submitButton = document.getElementById("submitButton");
const complaintsList = document.getElementById("complaintsList");
const successModal = document.getElementById("successModal");
const generatedId = document.getElementById("generatedId");

let latitude = null;
let longitude = null;
let selectedPhoto = null;
let speechRecognition = null;
let isRecording = false;

// Connect the character counter to the complaint textbox.
descriptionInput.addEventListener("input", () => {
  document.getElementById("charCount").textContent =
    `${descriptionInput.value.length} / 1000`;
});

// Translate selected language names into browser speech-recognition language codes.
const speechLanguages = {
  English: "en-IN",
  Kannada: "kn-IN",
  Hindi: "hi-IN",
  Telugu: "te-IN",
  Tamil: "ta-IN",
  Malayalam: "ml-IN",
  Marathi: "mr-IN",
  Bengali: "bn-IN"
};

function showFormMessage(message, type) {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`;
}

function hideFormMessage() {
  formMessage.textContent = "";
  formMessage.className = "form-message hidden";
}

// VOICE INPUT
voiceButton.addEventListener("click", startOrStopVoice);

function startOrStopVoice() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    speechNotice.textContent =
      "Voice input is not supported by this browser. Try Google Chrome on your Mac, or type your complaint.";
    speechNotice.classList.remove("hidden");
    return;
  }

  if (isRecording) {
    speechRecognition.stop();
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = speechLanguages[languageInput.value] || "en-IN";
  speechRecognition.continuous = false;
  speechRecognition.interimResults = true;

  speechRecognition.onstart = () => {
    isRecording = true;
    voiceButton.classList.add("recording");
    voiceButtonText.textContent = "Stop recording";
    voiceStatus.textContent = "Listening… speak now.";
    speechNotice.classList.add("hidden");
  };

  speechRecognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }

    if (finalText) {
      const existingText = descriptionInput.value.trim();
      descriptionInput.value = existingText
        ? `${existingText} ${finalText}`.trim()
        : finalText.trim();
      descriptionInput.dispatchEvent(new Event("input"));
    }

    voiceStatus.textContent = interimText
      ? `Hearing: ${interimText}`
      : "Voice captured. You can edit the text.";
  };

  speechRecognition.onerror = (event) => {
    voiceStatus.textContent = "Voice input could not be completed.";
    speechNotice.textContent =
      event.error === "not-allowed"
        ? "Microphone permission was blocked. Allow microphone access in your browser settings."
        : `Voice input error: ${event.error}. You can type your complaint instead.`;
    speechNotice.classList.remove("hidden");
  };

  speechRecognition.onend = () => {
    isRecording = false;
    voiceButton.classList.remove("recording");
    voiceButtonText.textContent = "Start voice input";
    if (voiceStatus.textContent === "Listening… speak now.") {
      voiceStatus.textContent = "No speech was captured. Try again or type.";
    }
  };

  speechRecognition.start();
}

// PHOTO PICKER AND PREVIEW
photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) return;

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    showFormMessage("Please choose a JPG, PNG or WEBP image.", "error");
    photoInput.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showFormMessage("The photo must be smaller than 5 MB.", "error");
    photoInput.value = "";
    return;
  }

  hideFormMessage();
  selectedPhoto = file;
  previewImage.src = URL.createObjectURL(file);
  photoName.textContent = file.name;
  photoPreview.classList.remove("hidden");
});

document.getElementById("removePhoto").addEventListener("click", () => {
  if (previewImage.src.startsWith("blob:")) URL.revokeObjectURL(previewImage.src);
  selectedPhoto = null;
  photoInput.value = "";
  previewImage.src = "";
  photoPreview.classList.add("hidden");
});

// GPS LOCATION
locationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    locationStatus.textContent = "GPS location is not supported by this browser.";
    return;
  }

  locationButton.disabled = true;
  locationButton.textContent = "Getting your location…";
  locationStatus.textContent = "Please allow location access in your browser.";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;

      latitudeValue.textContent = latitude.toFixed(6);
      longitudeValue.textContent = longitude.toFixed(6);
      coordinates.classList.remove("hidden");
      locationStatus.textContent = "Your current location has been added.";
      locationButton.disabled = false;
      locationButton.innerHTML = "<span>✓</span> Location added";
    },
    (error) => {
      const messages = {
        1: "Location permission was denied. Allow it in browser settings and try again.",
        2: "Your location could not be determined. Try again where GPS is available.",
        3: "Location request timed out. Please try again."
      };
      locationStatus.textContent = messages[error.code] || "Could not get your location.";
      locationButton.disabled = false;
      locationButton.innerHTML = "<span>⌖</span> Try location again";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});

// LOCAL DEMO STORAGE
function getMockComplaints() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveMockComplaint(complaint) {
  const complaints = getMockComplaints();
  complaints.unshift(complaint);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(complaints));
}

// SHOW RECENT COMPLAINTS
function renderComplaints(complaints) {
  complaintsList.innerHTML = "";

  if (!complaints || complaints.length === 0) {
    complaintsList.innerHTML =
      '<div class="empty-state">No complaints yet. Your submitted reports will appear here.</div>';
    return;
  }

  [...complaints]
  .sort((a, b) => {
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  })
  .slice(0, 5)
  .forEach((complaint) => {
    const item = document.createElement("div");
    item.className = "complaint-item";

    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = complaint.category || "Civic complaint";
    const description = document.createElement("small");
    description.textContent =
      `${complaint.complaint_id || complaint.id || "Complaint"} · ${complaint.description || ""}`;
    details.append(title, description);

    const badge = document.createElement("span");
    badge.className = "complaint-badge";
    badge.textContent = complaint.priority || "Submitted";

    item.append(details, badge);
    complaintsList.append(item);
  });
}

async function loadComplaints() {
  if (MOCK_MODE) {
    renderComplaints(getMockComplaints());
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/complaints`);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const data = await response.json();
    renderComplaints(Array.isArray(data) ? data : (data.complaints || []));
  } catch (error) {
    complaintsList.innerHTML =
      '<div class="empty-state">Could not load complaints from the server. Check that your backend is running.</div>';
    console.error("GET /complaints failed:", error);
  }
}

document.getElementById("refreshButton").addEventListener("click", loadComplaints);

// SUBMIT COMPLAINT
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideFormMessage();

  const description = descriptionInput.value.trim();
  if (!description) {
    showFormMessage("Please enter or record a complaint description.", "error");
    descriptionInput.focus();
    return;
  }

 
  // These are the six fields agreed with the backend team.
    const complaint = {
    description: description,
    language: languageInput.value,
    latitude: manualLocationInput.value.trim()
    ? selectedLatitude
    : latitude,

    longitude: manualLocationInput.value.trim()
    ? selectedLongitude
    : longitude,
    manual_location: document.getElementById("manualLocation")?.value.trim() || ""
  };

  submitButton.disabled = true;
  submitButton.textContent = "Submitting…";

  try {
    let result;

    if (MOCK_MODE) {
      // Simulate a backend response for the first version of the website.
      await new Promise((resolve) => setTimeout(resolve, 600));
      const mockId = `CIV-${Date.now().toString().slice(-6)}`;
      result = { ...complaint, complaint_id: mockId, status: "Submitted" };
      saveMockComplaint(result);
    } else {
      const response = await fetch(`${API_BASE_URL}/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(complaint)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server returned ${response.status}`);
      }

      result = await response.json();
    }

    const id = result.complaint?.complaint_id || result.complaint_id || result.id || "Submitted";
    generatedId.textContent = id;
    successModal.classList.remove("hidden");

    form.reset();
    descriptionInput.dispatchEvent(new Event("input"));
    latitude = null;
    longitude = null;
    selectedPhoto = null;
    photoPreview.classList.add("hidden");
    previewImage.src = "";
    coordinates.classList.add("hidden");
    locationStatus.textContent = "Location has not been added yet.";
    locationButton.innerHTML = "<span>⌖</span> Use my current location";
    await loadComplaints();
  } catch (error) {
    console.error("Complaint submission failed:", error);
    showFormMessage(
      MOCK_MODE
        ? "The demo complaint could not be saved in this browser."
        : "Could not submit your complaint. Check the backend connection and try again.",
      "error"
    );
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Submit complaint <span>→</span>';
  }
});

document.getElementById("closeModal").addEventListener("click", () => {
  successModal.classList.add("hidden");
});
 successModal.addEventListener("click", (event) => {
  if (event.target === successModal) successModal.classList.add("hidden");
});

document.getElementById("refreshButton").addEventListener("click", () => {
    console.log("REFRESH BUTTON CLICKED");
    loadComplaints();
});

// Load saved demo complaints when the page opens.
loadComplaints();
