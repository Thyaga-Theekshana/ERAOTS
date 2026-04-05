import asyncio, httpx

async def test():
    async with httpx.AsyncClient() as client:
        login_data = {'username': 'admin@eraots.com', 'password': 'admin123'}
        r = await client.post('http://localhost:8000/api/auth/login', data=login_data)
        if r.status_code != 200:
            print("Login failed:", r.status_code, r.text)
            return

        token = r.json()['access_token']
        headers = {'Authorization': f'Bearer {token}'}
        
        r2 = await client.post('http://localhost:8000/api/attendance/process?target_date=2026-04-05', headers=headers)
        print('PROCESS STATUS:', r2.status_code)
        print('PROCESS RESP:', r2.json())
        
        r3 = await client.get('http://localhost:8000/api/attendance/?start_date=2026-04-05', headers=headers)
        print('FETCH STATUS:', r3.status_code)
        
        recs = r3.json()
        print(f'Total Records: {len(recs)}')
        for p in recs:
            print(f"  {p['employee_name']} (Active: {p['total_active_time_min']}m, Status: {p['status']})")

if __name__ == "__main__":
    asyncio.run(test())
