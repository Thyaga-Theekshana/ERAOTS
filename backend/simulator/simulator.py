"""
Hardware Scanner Simulator.
Generates realistic scan events for development and testing.
Sends events to the ERAOTS API just like real hardware would.
"""
import httpx
import asyncio
import random
from datetime import datetime, timezone
from typing import List, Dict
import logging
import argparse

logger = logging.getLogger("simulator")
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-8s | %(message)s")

API_BASE = "http://localhost:8000"

# Sample employee fingerprints for simulation
SAMPLE_EMPLOYEES = [
    {"name": "Alice Johnson", "fp": "FP-001"},
    {"name": "Bob Smith", "fp": "FP-002"},
    {"name": "Charlie Brown", "fp": "FP-003"},
    {"name": "Diana Prince", "fp": "FP-004"},
    {"name": "Eve Williams", "fp": "FP-005"},
    {"name": "Frank Miller", "fp": "FP-006"},
    {"name": "Grace Lee", "fp": "FP-007"},
    {"name": "Henry Davis", "fp": "FP-008"},
    {"name": "Ivy Chen", "fp": "FP-009"},
    {"name": "Jack Wilson", "fp": "FP-010"},
    {"name": "Karen Taylor", "fp": "FP-011"},
    {"name": "Leo Martinez", "fp": "FP-012"},
    {"name": "Mia Anderson", "fp": "FP-013"},
    {"name": "Nathan Thomas", "fp": "FP-014"},
    {"name": "Olivia Moore", "fp": "FP-015"},
    {"name": "Peter Jackson", "fp": "FP-016"},
    {"name": "Quinn Harris", "fp": "FP-017"},
    {"name": "Rachel Clark", "fp": "FP-018"},
    {"name": "Sam Rodriguez", "fp": "FP-019"},
    {"name": "Tara Hall", "fp": "FP-020"},
]


async def get_scanners() -> List[Dict]:
    """Fetch registered scanners from the API."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{API_BASE}/api/health")
            if resp.status_code == 200:
                logger.info("Connected to ERAOTS API")
            # For now, we need scanner IDs from the database
            # In a real setup, scanners would be pre-configured
            return []
        except Exception as e:
            logger.error(f"Cannot connect to API: {e}")
            return []


async def send_scan(scanner_id: str, fingerprint_id: str):
    """Send a single scan event to the API."""
    async with httpx.AsyncClient() as client:
        try:
            payload = {
                "scanner_id": scanner_id,
                "fingerprint_id": fingerprint_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            resp = await client.post(f"{API_BASE}/api/events/scan", json=payload)
            data = resp.json()
            
            if resp.status_code == 200:
                direction = data.get("direction", "?")
                emp_name = data.get("employee_name", "Unknown")
                valid = data.get("is_valid", False)
                door = data.get("door_name", "?")
                
                if valid:
                    icon = ">>>" if direction == "IN" else "<<<"
                    logger.info(f"{icon} {emp_name} scanned {direction} at {door}")
                else:
                    reason = data.get("rejection_reason", "unknown")
                    logger.warning(f"!!! Scan rejected: {reason}")
            else:
                logger.error(f"API error: {resp.status_code} - {resp.text}")
                
        except Exception as e:
            logger.error(f"Failed to send scan: {e}")


async def simulate_workday(scanner_ids: List[str], employee_fps: List[str], speed: float = 1.0):
    """
    Simulate a full workday of employee scans.
    
    Args:
        scanner_ids: List of registered scanner UUIDs
        employee_fps: List of fingerprint IDs to simulate
        speed: Speed multiplier (2.0 = twice as fast)
    """
    if not scanner_ids:
        logger.error("No scanners available. Register scanners first via the admin panel.")
        return
    
    logger.info(f"Starting workday simulation with {len(employee_fps)} employees on {len(scanner_ids)} doors")
    
    # Phase 1: Morning arrivals (staggered)
    logger.info("--- MORNING ARRIVALS ---")
    for fp in employee_fps:
        scanner = random.choice(scanner_ids)
        await send_scan(scanner, fp)
        await asyncio.sleep(random.uniform(0.5, 2.0) / speed)
    
    await asyncio.sleep(3 / speed)
    
    # Phase 2: Some people go on break
    logger.info("--- BREAK TIME ---")
    break_employees = random.sample(employee_fps, min(5, len(employee_fps)))
    for fp in break_employees:
        scanner = random.choice(scanner_ids)
        await send_scan(scanner, fp)  # Exit
        await asyncio.sleep(random.uniform(0.3, 1.0) / speed)
    
    await asyncio.sleep(2 / speed)
    
    # Phase 3: Break employees return
    logger.info("--- RETURNING FROM BREAK ---")
    for fp in break_employees:
        scanner = random.choice(scanner_ids)
        await send_scan(scanner, fp)  # Re-enter
        await asyncio.sleep(random.uniform(0.3, 1.0) / speed)
    
    await asyncio.sleep(2 / speed)
    
    # Phase 4: Edge cases
    logger.info("--- EDGE CASE TESTS ---")
    # Double scan
    if employee_fps:
        fp = employee_fps[0]
        scanner = scanner_ids[0]
        await send_scan(scanner, fp)
        await asyncio.sleep(0.5)
        logger.info("Sending duplicate scan (should be rejected)...")
        await send_scan(scanner, fp)  # Should be flagged as duplicate
    
    # Unregistered fingerprint
    logger.info("Sending unregistered fingerprint...")
    await send_scan(scanner_ids[0], "UNKNOWN-FP-999")
    
    await asyncio.sleep(2 / speed)
    
    # Phase 5: End of day exits
    logger.info("--- END OF DAY ---")
    for fp in employee_fps:
        scanner = random.choice(scanner_ids)
        await send_scan(scanner, fp)  # Exit
        await asyncio.sleep(random.uniform(0.3, 1.0) / speed)
    
    logger.info("Simulation complete!")


async def continuous_simulation(scanner_ids: List[str], employee_fps: List[str], interval: int = 30):
    """Run continuous random scans at the given interval."""
    logger.info(f"Continuous simulation: 1 random scan every {interval}s")
    
    while True:
        fp = random.choice(employee_fps)
        scanner = random.choice(scanner_ids)
        await send_scan(scanner, fp)
        await asyncio.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="ERAOTS Hardware Scanner Simulator")
    parser.add_argument("--mode", choices=["workday", "continuous", "single"], default="workday",
                       help="Simulation mode")
    parser.add_argument("--scanner-ids", nargs="*", help="Scanner UUIDs (space-separated)")
    parser.add_argument("--speed", type=float, default=1.0, help="Speed multiplier")
    parser.add_argument("--interval", type=int, default=30, help="Seconds between scans (continuous mode)")
    parser.add_argument("--employees", type=int, default=10, help="Number of employees to simulate")
    parser.add_argument("--api-url", default="http://localhost:8000", help="ERAOTS API base URL")
    
    args = parser.parse_args()
    global API_BASE
    API_BASE = args.api_url
    
    if not args.scanner_ids:
        logger.error("Please provide scanner IDs with --scanner-ids <id1> <id2>")
        logger.info("You can find scanner IDs in the admin panel or API at /docs")
        return
    
    fps = [emp["fp"] for emp in SAMPLE_EMPLOYEES[:args.employees]]
    
    if args.mode == "workday":
        asyncio.run(simulate_workday(args.scanner_ids, fps, args.speed))
    elif args.mode == "continuous":
        asyncio.run(continuous_simulation(args.scanner_ids, fps, args.interval))
    elif args.mode == "single":
        if fps and args.scanner_ids:
            asyncio.run(send_scan(args.scanner_ids[0], fps[0]))


if __name__ == "__main__":
    main()
