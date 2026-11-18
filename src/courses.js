// Curated FREE courses per field (audit/free tiers — verified public URLs)
const COURSES = {
  cybersecurity: [
    { title: 'Google Cybersecurity Professional Certificate', provider: 'Coursera (audit free)', url: 'https://www.coursera.org/professional-certificates/google-cybersecurity', level: 'Beginner', hours: '6 months' },
    { title: 'Introduction to Cybersecurity', provider: 'Cisco Networking Academy', url: 'https://www.netacad.com/courses/introduction-to-cybersecurity', level: 'Beginner', hours: '6 hours' },
    { title: 'TryHackMe — Free beginner rooms', provider: 'TryHackMe', url: 'https://tryhackme.com/room/btopictwo', level: 'Beginner–Intermediate', hours: 'Self-paced' },
    { title: 'Cybrary — Free cybersecurity courses', provider: 'Cybrary', url: 'https://www.cybrary.it/free-courses', level: 'All levels', hours: 'Self-paced' },
    { title: 'OWASP Web Security Testing Guide', provider: 'OWASP', url: 'https://owasp.org/www-project-web-security-testing-guide/', level: 'Intermediate', hours: 'Reference' }
  ],
  networking: [
    { title: 'Google IT Support Professional Certificate', provider: 'Coursera (audit free)', url: 'https://www.coursera.org/professional-certificates/google-it-support', level: 'Beginner', hours: '6 months' },
    { title: 'Networking Basics & CCNA prep', provider: 'Cisco Networking Academy', url: 'https://www.netacad.com/courses/networking-basics', level: 'Beginner', hours: 'Self-paced' },
    { title: 'Networking Certification (freeCodeCamp)', provider: 'freeCodeCamp / YouTube', url: 'https://www.freecodecamp.org/news/networking-course/', level: 'Beginner', hours: '4 hours' },
    { title: 'Professor Messer — CompTIA Network+ N10', provider: 'Professor Messer', url: 'https://www.professormesser.com/network-plus/n10-009/n10-009-training-course/', level: 'Intermediate', hours: '20+ hours' },
    { title: 'CS144 — Introduction to Computer Networking labs', provider: 'Stanford (free)', url: 'https://cs144.github.io/', level: 'Advanced', hours: 'University course' }
  ],
  robotics: [
    { title: 'Modern Robotics: Mechanics, Planning & Control', provider: 'Coursera (audit free)', url: 'https://www.coursera.org/learn/modern-robotics', level: 'Intermediate', hours: '6-part series' },
    { title: 'Introduction to Robotics', provider: 'edX', url: 'https://www.edx.org/learn/robotics', level: 'Beginner', hours: 'Self-paced' },
    { title: 'ROS 2 Tutorials', provider: 'ROS Docs (free)', url: 'https://docs.ros.org/en/humble/Tutorials.html', level: 'Intermediate', hours: 'Self-paced' },
    { title: 'Robotics: Mechanics and Control', provider: 'MIT OCW', url: 'https://ocw.mit.edu/search/?q=robotics', level: 'Intermediate', hours: 'University course' },
    { title: 'Robotics Specialization', provider: 'Coursera / UPenn (audit free)', url: 'https://www.coursera.org/specializations/robotics', level: 'Intermediate', hours: '6 courses' }
  ],
  'artificial-intelligence': [
    { title: 'Google AI Essentials', provider: 'Coursera (audit free)', url: 'https://www.coursera.org/learn/google-ai-essentials', level: 'Beginner', hours: '10 hours' },
    { title: 'Practical Deep Learning for Coders', provider: 'fast.ai (free)', url: 'https://course.fast.ai/', level: 'Intermediate', hours: 'Self-paced' },
    { title: 'Hugging Face NLP Course', provider: 'Hugging Face (free)', url: 'https://huggingface.co/learn/nlp-course', level: 'Intermediate', hours: 'Self-paced' },
    { title: "CS50's Introduction to Artificial Intelligence", provider: 'Harvard / edX', url: 'https://cs50.harvard.edu/ai/', level: 'Intermediate', hours: '7 weeks' },
    { title: 'Intro to Machine Learning', provider: 'Kaggle Learn (free)', url: 'https://www.kaggle.com/learn/intro-to-machine-learning', level: 'Beginner', hours: '4 hours' }
  ],
  programming: [
    { title: 'freeCodeCamp — Learn to Code for Free', provider: 'freeCodeCamp', url: 'https://www.freecodecamp.org/learn', level: 'Beginner', hours: 'Certifications' },
    { title: 'The Odin Project — Full Stack Curriculum', provider: 'The Odin Project (free)', url: 'https://www.theodinproject.com/', level: 'Beginner–Advanced', hours: 'Self-paced' },
    { title: 'CS50x — Introduction to Computer Science', provider: 'Harvard / edX', url: 'https://cs50.harvard.edu/x/', level: 'Beginner', hours: '12 weeks' },
    { title: 'MDN Web Development Guides', provider: 'Mozilla (free)', url: 'https://developer.mozilla.org/en-US/docs/Learn', level: 'Beginner', hours: 'Self-paced' },
    { title: 'Exercism — Coding practice in 70+ languages', provider: 'Exercism (free)', url: 'https://exercism.org/tracks', level: 'All levels', hours: 'Self-paced' }
  ],
  'cloud-computing': [
    { title: 'AWS Skill Builder — Free tier training', provider: 'Amazon (free)', url: 'https://skillbuilder.aws/', level: 'Beginner–Advanced', hours: 'Self-paced' },
    { title: 'Google Cloud Skills Boost', provider: 'Google (free tier)', url: 'https://cloudskillsboost.google', level: 'Beginner–Advanced', hours: 'Self-paced' },
    { title: 'Microsoft Learn — Azure fundamentals', provider: 'Microsoft (free)', url: 'https://learn.microsoft.com/en-us/training/paths/azure-fundamentals/', level: 'Beginner', hours: 'Self-paced' },
    { title: 'Introduction to Cloud Computing', provider: 'edX', url: 'https://www.edx.org/learn/cloud-computing', level: 'Beginner', hours: 'Self-paced' },
    { title: 'KodeKloud — Free Kubernetes & DevOps labs', provider: 'KodeKloud (free tier)', url: 'https://kodekloud.com/free-labs/', level: 'Intermediate', hours: 'Hands-on labs' }
  ],
  'data-science': [
    { title: 'Kaggle Learn — Micro-courses', provider: 'Kaggle (free)', url: 'https://www.kaggle.com/learn', level: 'Beginner', hours: '4h each' },
    { title: 'IBM Data Science Professional Certificate', provider: 'Coursera (audit free)', url: 'https://www.coursera.org/professional-certificates/ibm-data-science', level: 'Beginner', hours: '5 months' },
    { title: 'Data Scientist with Python track', provider: 'DataCamp (free intro)', url: 'https://www.datacamp.com/tracks/data-scientist-with-python', level: 'Beginner–Intermediate', hours: 'Self-paced' },
    { title: 'Statistics Fundamentals', provider: 'StatQuest / YouTube (free)', url: 'https://www.youtube.com/c/joshstarmer', level: 'Beginner', hours: 'Self-paced' },
    { title: 'Data Analysis with Python', provider: 'freeCodeCamp', url: 'https://www.freecodecamp.org/news/data-analysis-with-python-course/', level: 'Beginner', hours: '5+ hours' }
  ],
  'software-engineering': [
    { title: 'OSSU — Open Source Society University', provider: 'GitHub (free)', url: 'https://github.com/ossu/computer-science', level: 'Beginner–Advanced', hours: 'Full curriculum' },
    { title: 'Software Design and Architecture', provider: 'Coursera (audit free)', url: 'https://www.coursera.org/learn/software-design-architecture', level: 'Intermediate', hours: '4 weeks' },
    { title: 'Refactoring Guru — Design Patterns & Refactoring', provider: 'Refactoring.Guru (free)', url: 'https://refactoring.guru/', level: 'Intermediate', hours: 'Self-paced' },
    { title: 'GitHub Skills — Git & GitHub hands-on', provider: 'GitHub (free)', url: 'https://skills.github.com', level: 'Beginner', hours: 'Interactive' },
    { title: 'MIT 6.0001 — Intro to CS & Python', provider: 'MIT OCW', url: 'https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/', level: 'Beginner', hours: 'University course' }
  ]
};

function getCourses(fieldId) {
  return COURSES[fieldId] || [];
}

module.exports = { getCourses, COURSES };
