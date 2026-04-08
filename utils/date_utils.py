"""
Date utility functions for calculating working days, excluding weekends and holidays.
Includes Dutch public holidays.
"""
from datetime import date, timedelta
from typing import List, Set

# Dutch public holidays (fixed dates)
DUTCH_FIXED_HOLIDAYS = {
    (1, 1): "Nieuwjaarsdag (New Year's Day)",
    (4, 27): "Koningsdag (King's Day)",
    (5, 5): "Bevrijdingsdag (Liberation Day)",  # Every 5 years
    (12, 25): "Eerste Kerstdag (Christmas Day)",
    (12, 26): "Tweede Kerstdag (Boxing Day)",
}

def get_easter_date(year: int) -> date:
    """
    Calculate Easter Sunday for a given year using Meeus/Jones/Butcher algorithm.
    """
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)

def get_dutch_holidays(year: int) -> Set[date]:
    """
    Get all Dutch public holidays for a given year.
    Includes both fixed and movable holidays (Easter-based).
    """
    holidays = set()
    
    # Add fixed holidays
    for (month, day), name in DUTCH_FIXED_HOLIDAYS.items():
        holidays.add(date(year, month, day))
    
    # Calculate Easter-based holidays
    easter = get_easter_date(year)
    
    # Goede Vrijdag (Good Friday) - Easter - 2 days
    holidays.add(easter - timedelta(days=2))
    
    # Eerste Paasdag (Easter Sunday)
    holidays.add(easter)
    
    # Tweede Paasdag (Easter Monday)
    holidays.add(easter + timedelta(days=1))
    
    # Hemelvaart (Ascension Day) - Easter + 39 days
    holidays.add(easter + timedelta(days=39))
    
    # Eerste Pinksterdag (Whit Sunday/Pentecost) - Easter + 49 days
    holidays.add(easter + timedelta(days=49))
    
    # Tweede Pinksterdag (Whit Monday) - Easter + 50 days
    holidays.add(easter + timedelta(days=50))
    
    return holidays

def is_working_day(check_date: date, include_saturday: bool = False) -> bool:
    """
    Check if a date is a working day (not weekend or holiday).
    
    Args:
        check_date: The date to check
        include_saturday: If True, Saturday is considered a working day
        
    Returns:
        True if the date is a working day, False otherwise
    """
    # Check if weekend
    if check_date.weekday() == 6:  # Sunday
        return False
    if check_date.weekday() == 5 and not include_saturday:  # Saturday
        return False
    
    # Check if Dutch holiday
    holidays = get_dutch_holidays(check_date.year)
    if check_date in holidays:
        return False
    
    return True

def add_working_days(start_date: date, working_days: int, include_saturday: bool = False) -> date:
    """
    Add a number of working days to a start date, excluding weekends and holidays.
    
    Args:
        start_date: The starting date
        working_days: Number of working days to add
        include_saturday: If True, Saturday is considered a working day
        
    Returns:
        The resulting date after adding working days
    """
    current_date = start_date
    days_added = 0
    
    while days_added < working_days:
        current_date += timedelta(days=1)
        if is_working_day(current_date, include_saturday):
            days_added += 1
    
    return current_date

def subtract_working_days(end_date: date, working_days: int, include_saturday: bool = False) -> date:
    """
    Subtract a number of working days from an end date, excluding weekends and holidays.
    
    Args:
        end_date: The ending date
        working_days: Number of working days to subtract
        include_saturday: If True, Saturday is considered a working day
        
    Returns:
        The resulting date after subtracting working days
    """
    current_date = end_date
    days_subtracted = 0
    
    while days_subtracted < working_days:
        current_date -= timedelta(days=1)
        if is_working_day(current_date, include_saturday):
            days_subtracted += 1
    
    return current_date

def count_working_days(start_date: date, end_date: date, include_saturday: bool = False) -> int:
    """
    Count the number of working days between two dates (inclusive).
    
    Args:
        start_date: The starting date
        end_date: The ending date
        include_saturday: If True, Saturday is considered a working day
        
    Returns:
        The number of working days between the dates
    """
    if start_date > end_date:
        return 0
    
    working_days = 0
    current_date = start_date
    
    while current_date <= end_date:
        if is_working_day(current_date, include_saturday):
            working_days += 1
        current_date += timedelta(days=1)
    
    return working_days

def get_next_working_day(check_date: date, include_saturday: bool = False) -> date:
    """
    Get the next working day after a given date.
    
    Args:
        check_date: The date to check from
        include_saturday: If True, Saturday is considered a working day
        
    Returns:
        The next working day
    """
    next_day = check_date + timedelta(days=1)
    while not is_working_day(next_day, include_saturday):
        next_day += timedelta(days=1)
    return next_day

def calculate_end_date_from_hours(start_date: date, allocated_hours: float, 
                                   hours_per_day: float = 8.0, 
                                   include_saturday: bool = False) -> date:
    """
    Calculate the end date for a task given start date and allocated hours.
    
    Args:
        start_date: The starting date
        allocated_hours: Total hours allocated for the task
        hours_per_day: Working hours per day (default 8)
        include_saturday: If True, Saturday is considered a working day
        
    Returns:
        The calculated end date
    """
    # Calculate number of working days needed
    working_days_needed = max(1, int((allocated_hours + hours_per_day - 0.01) / hours_per_day))
    
    # Add working days to start date
    return add_working_days(start_date, working_days_needed - 1, include_saturday)

def get_holidays_in_range(start_date: date, end_date: date) -> List[tuple]:
    """
    Get all holidays within a date range.
    
    Args:
        start_date: The starting date
        end_date: The ending date
        
    Returns:
        List of tuples (date, name) for holidays in range
    """
    holidays_list = []
    years = range(start_date.year, end_date.year + 1)
    
    for year in years:
        holidays = get_dutch_holidays(year)
        for holiday_date in holidays:
            if start_date <= holiday_date <= end_date:
                # Find the holiday name
                name = "Dutch Holiday"
                for (month, day), hol_name in DUTCH_FIXED_HOLIDAYS.items():
                    if holiday_date.month == month and holiday_date.day == day:
                        name = hol_name
                        break
                holidays_list.append((holiday_date, name))
    
    return sorted(holidays_list)
