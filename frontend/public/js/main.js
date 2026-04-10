async function buyCourse(courseId, buttonElement) {
  try {
    // Show loading state
    const originalText = buttonElement ? buttonElement.innerHTML : 'Processing...';
    if (buttonElement) {
      buttonElement.disabled = true;
      buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    }

    const res = await fetch('/payment/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create payment order');
    }

    const data = await res.json();
    
    const options = {
      key: data.keyId, // Changed from data.key to data.keyId to match backend response
      amount: data.amount,
      currency: "INR",
      name: "EduLearn Courses",
      description: `Purchase: ${data.courseTitle || 'Course Access'}`,
      order_id: data.orderId,
      prefill: {
        name: data.studentName || '',
        email: data.studentEmail || ''
      },
      handler: async function (response) {
        try {
          const verify = await fetch('/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          
          const result = await verify.json();
          
          if (result.success) {
            // Show success message
            showToast('success', 'Payment Successful!', 'You now have access to the course.');
            
            // Redirect to course page or dashboard after a short delay
            setTimeout(() => {
              if (result.redirectUrl) {
                window.location.href = result.redirectUrl;
              } else {
                window.location.href = '/student/dashboard';
              }
            }, 1500);
          } else {
            showToast('error', 'Payment Verification Failed', result.message || 'Please contact support if the amount was deducted.');
          }
        } catch (error) {
          console.error('Verification error:', error);
          showToast('error', 'Error', 'An error occurred while verifying your payment. Please check your enrollments or contact support.');
        }
      },
      modal: {
        ondismiss: function() {
          // Reset button state if payment modal is closed
          if (buttonElement) {
            buttonElement.disabled = false;
            buttonElement.innerHTML = originalText;
          }
        }
      },
      theme: { 
        color: "#4a6cf7",
        backdrop_color: "#0f172a99"
      }
    };

    const rzp = new Razorpay(options);
    rzp.open();
    
  } catch (error) {
    console.error('Payment error:', error);
    showToast('error', 'Error', error.message || 'Failed to process payment');
    
    // Reset button state
    if (buttonElement) {
      buttonElement.disabled = false;
      buttonElement.innerHTML = originalText;
    }
  }
}

// Helper function to show toast messages
function showToast(type, title, message) {
  // You can replace this with your preferred toast/notification library
  // This is a simple implementation using the browser's alert
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <strong>${title}</strong>
    <p>${message}</p>
  `;
  document.body.appendChild(toast);
  
  // Auto-remove toast after 5 seconds
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

// Make the function available globally
window.buyCourse = buyCourse;

// Theme Toggle Functionality
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

if (themeToggle && themeIcon) {
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-theme");

    if (document.body.classList.contains("dark-theme")) {
      themeIcon.classList.replace("fa-moon", "fa-sun");
      localStorage.setItem("theme", "dark");
    } else {
      themeIcon.classList.replace("fa-sun", "fa-moon");
      localStorage.setItem("theme", "light");
    }
  });

  window.onload = () => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.body.classList.add("dark-theme");
      themeIcon.classList.replace("fa-moon", "fa-sun");
    }
  };
}
