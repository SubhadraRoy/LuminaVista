#!/usr/bin/env python3
# simple beginner-style program: sum of factors (divisors)

# ask user for input
n = int(input("Enter a positive integer: "))

if n <= 0:
	print("Please enter a positive integer")
else:
	s = 0
	i = 1
	while i <= n:
		if n % i == 0:
			s = s + i
		i = i + 1
	print(str(n) + " sum of factors = " + str(s))

