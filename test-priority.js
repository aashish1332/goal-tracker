const fetch = require('node-fetch');

async function testPriority() {
  try {
    const response = await fetch('http://localhost:3000/api/goals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test goal with lowercase priority',
        priority: 'medium', // lowercase - should be normalized to 'Medium'
        deadline: '',
        notes: '',
        recurrence: null,
        tags: []
      })
    });

    const result = await response.json();
    console.log('Response:', result);

    if (result.priority === 'Medium') {
      console.log('✅ SUCCESS: Priority correctly normalized to Medium');
    } else {
      console.log('❌ FAILURE: Priority is', result.priority, 'expected Medium');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testPriority();