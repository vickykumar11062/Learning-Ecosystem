# 📚 Smart Digital Learning Ecosystem

A full-stack web application built using the **MERN stack (MongoDB, Express.js, React.js, Node.js)** that enables seamless digital learning through course management, assignment tracking, and student progress monitoring.

---

## 🚀 Features

* 👨‍🎓 **User Authentication & Authorization**

  * Secure login/signup using JWT
  * Role-based access (Student / Admin)

* 📘 **Course Management**

  * Create, update, and manage courses
  * Enroll students into courses

* 📝 **Assignment System**

  * Upload and submit assignments
  * Track submission status

* 📊 **Progress Tracking**

  * Monitor student performance
  * Real-time updates and analytics

* 🎨 **Modern UI/UX**

  * Responsive design using Tailwind CSS / Material UI
  * Component-based architecture in React

---

## 🛠️ Tech Stack

### Frontend:

* React.js
* Tailwind CSS / Material UI
* Axios

### Backend:

* Node.js
* Express.js
* RESTful APIs

### Database:

* MongoDB

### Authentication:

* JSON Web Tokens (JWT)

---

## 📂 Project Structure

```
Smart-Digital-Learning-Ecosystem/
│
├── client/                # React frontend
│   ├── src/
│   └── public/
│
├── server/                # Node.js backend
│   ├── controllers/
│   ├── routes/
│   ├── models/
│   └── middleware/
│
├── config/                # DB and environment configs
├── .env
├── package.json
└── README.md
```

---

## ⚙️ Installation & Setup

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/vickykumar11062/Learning-Ecosystem.git
cd Learning-Ecosystem
```

### 2️⃣ Install Dependencies

#### Backend:

```bash
cd server
npm install
```

#### Frontend:

```bash
cd client
npm install
```

---

### 3️⃣ Setup Environment Variables

Create a `.env` file in the server folder and add:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

---

### 4️⃣ Run the Application

#### Start Backend:

```bash
cd server
npm run dev
```

#### Start Frontend:

```bash
cd client
npm start
```

---

## 🔗 API Endpoints (Sample)

| Method | Endpoint           | Description       |
| ------ | ------------------ | ----------------- |
| POST   | /api/auth/register | Register user     |
| POST   | /api/auth/login    | Login user        |
| GET    | /api/courses       | Get all courses   |
| POST   | /api/courses       | Create course     |
| POST   | /api/assignments   | Submit assignment |

---

## 📌 Future Enhancements

* 📹 Video lecture integration
* 🔔 Notification system
* 📱 Mobile app version
* 📈 Advanced analytics dashboard

---

## 🤝 Contributing

Contributions are welcome! Feel free to fork this repo and submit a pull request.

---

## 📧 Contact

**Vicky Kumar**

* GitHub: https://github.com/vickykumar11062
* LinkedIn: https://www.linkedin.com/in/vicky-kumar-3a4566284/

---

## ⭐ If you like this project, give it a star!

---
