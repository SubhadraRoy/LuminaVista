n = int(input("Enter a positive whole number: "))

if n <= 1:
    print("Please enter a number greater than 1")
else:
    total = 0
    i = 1
    # find factors and add them
    while i < n:
        if n % i == 0:
            total = total + i
        i = i + 1

    print("Sum of factors = " + str(total))
    if total == n:
        print(str(n) + " is a perfect number")
    else:
        print(str(n) + " is not a perfect number")
