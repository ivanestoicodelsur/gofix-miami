(async ()=>{
  try {
    const loginRes = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'gofixcompany@gmail.com', password: 'ijrr9224' })
    });
    const loginJson = await loginRes.json();
    console.log('LOGIN', loginJson);
    const token = loginJson.token;
    if (!token) throw new Error('No token returned');

    const title = 'Prueba socket ' + Math.floor(Math.random()*10000);
    const createRes = await fetch('http://localhost:4000/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ title, description: 'Creado para prueba socket' })
    });
    const createJson = await createRes.json();
    console.log('CREATED', createJson);
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  }
})();
