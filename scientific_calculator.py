import math

while True:
    print("\n===== SCIENTIFIC CALCULATOR =====")
    print("1. Addition")
    print("2. Subtraction")
    print("3. Multiplication")
    print("4. Division")
    print("5. Square Root")
    print("6. Power")
    print("7. Sine")
    print("8. Cosine")
    print("9. Tangent")
    print("10. Logarithm")
    print("11. Factorial")
    print("12. Exit")
    choice = int(input("Enter your choice: "))

    if choice == 1:
        a = float(input("Enter first number: "))
        b = float(input("Enter second number: "))
        print("Result =", a + b)
    elif choice == 2:
        a = float(input("Enter first number: "))
        b = float(input("Enter second number: "))
        print("Result =", a - b)
    elif choice == 3:
        a = float(input("Enter first number: "))
        b = float(input("Enter second number: "))
        print("Result =", a * b)
    elif choice == 4:
        a = float(input("Enter first number: "))
        b = float(input("Enter second number: "))
        print("Result =", a / b)
    elif choice == 5:
        n = float(input("Enter number: "))
        print("Square Root =", math.sqrt(n))
    elif choice == 6:
        a = float(input("Enter base: "))
        b = float(input("Enter exponent: "))
        print("Result =", math.pow(a, b))
    elif choice == 7:
        angle = float(input("Enter angle in degrees: "))
        print("Sin =", math.sin(math.radians(angle)))
    elif choice == 8:
        angle = float(input("Enter angle in degrees: "))
        print("Cos =", math.cos(math.radians(angle)))
    elif choice == 9:
        angle = float(input("Enter angle in degrees: "))
        print("Tan =", math.tan(math.radians(angle)))
    elif choice == 10:
        n = float(input("Enter number: "))
        print("Log =", math.log10(n))
    elif choice == 11:
        n = int(input("Enter number: "))
        print("Factorial =", math.factorial(n))
    elif choice == 12:
        print("Calculator Closed")
        break
    else:
        print("Invalid Choice")
